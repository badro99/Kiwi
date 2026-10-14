# Kiwi design 2027 · direction

Revision 25, written in reply to the round 25 critique (`docs/audits/design-2026-10/direction-critique-24.md`: 3 majors, 13 polish items, no blocker; Motion and Performance at 10 and not reopened; all four rebuttals accepted again). It is the last critic round (owner, 2026-10-13): after its items, one inventory pass names every shipped entry point, and what stays open is listed under §23 for the owner. It keeps revision 23, the owner's decision of 2026-10-13 that the floor plan stays as shipped, and the replies to rounds 22 to 24. It is a proposal for the owner to approve. Nothing below is built until the owner approves it and the before-and-after page (`docs/specs/kiwi-design-2027-preview.html`, with its captures in `docs/specs/kiwi-design-2027-preview/`). Until then the current brand lock governs anything that ships, including the 13 fix-now items in `docs/audits/design-2026-10/findings.md`.

**Line citations: one commit, `31c94529`, plus fourteen shipped commits.** Every `file:line` in this document was read at `31c94529` unless it names another commit. The dashboard lock's rows are cited at `a8158aad`, the head of `main` for those files (after `4dcd0685` and `0268c92f`; revision 20). Two server changes landed on `main` after `31c94529` and are cited **as shipped**: `e5639388` (a failed password write hands the reset token back) and `a3de3011` (`/auth/reset` then answers `{error:'update-failed', retry:true}` with status 500 only when the hand-back really changed the row, and `reset.html` keeps the form open on `retry`). Lines in `functions/auth/reset.js` and `reset.html` that carry `@a3de3011` were read there. Revision 21 adds two: the store lock (§10.26) is cited at `762bb255`, the commit that shipped it, and the native app's Face ID (§10.2) at `app/src/native-runtime.js@ae45b301`, the head of `main` when it was read; `assets/till-tenant.js` is the same file at both. Revision 22 adds `319ac100`, the head of `main` when it was read, for the idle relock (`assets/idle-lock.js`, the till's `__kiwiUnlockApp`, the native plugin's biometric call, `tools/biometric-unlock-test.mjs`, `tools/check.js`) and for the floor plan (`assets/floorplan-core.js`, the till's plan reader and `renderRealGrid`); `app/src/native-runtime.js` is the same file at `ae45b301` and `319ac100`, and `assets/caisse-pairing.js` differs from `762bb255` only from line 900 on. Revision 24 adds three commits that landed on `main` while it was written: `cda95c04` (the Commandes drawer loses its Réconciliation and Anti-fraude tabs, §12), `f99fa1e1` (the iPhone dashboard follows Dynamic Type to 200 %, §6.4) and `954bbe18` (the accountant's read-only space and its Settings row, §12). Revision 25 adds three: `73870f82` (the Face ID record judged by the server, §10.2), `20f738c4` (the Morning briefing, §12) and `f432a1de`, the head of `main` when the inventory pass ran (§12's table of entry points, whose line numbers are that commit's). Citations carried over from revisions 2 to 5, which had been read at `f249411e`, were remapped with a line-level diff and re-read at `31c94529`.

**How revision 25 was written.** By hand: M1 (Kiwi AI's rows 1 to 3 per trade), M2 (the online orders' home in the Takeaway tab), M3 (the quick messages), P1 (`server-ack`), P2 ("Set a goal" as its own row), P6 (check 18 reads what is painted), P8 (tnum in the census), the Face ID refresh for `73870f82`, and then the inventory pass. Nine polish items were drafted by a small model as exact old and new text pairs (P3, P4, P5, P7, P9, P10, P11, P12, P13). Each was checked against the code and the spec before it was applied, and several were changed in review (below).

**What changed for the round 25 critique** ("drafted" marks a pair drafted by a small model, then reviewed):
- **M1, Kiwi AI asks the store's trade's questions (by hand).** Rows 1 to 3 come from the trade, as the shipped Home chips do: `getVocab('aiChips')` for a shop, a spa and a hotel (`assets/venues.js@319ac100:974-976`, `:997-999`, `:1020-1022`), the restaurant's from `dash.hero.ai.chip1` to `.chip3`. They are four §9.6 rows, `ai.suggest.restaurant`, `.boutique`, `.spa` and `.hotel`, which replace `ai.suggest.compare`, `.reorder` and `.best_after`. The restaurant's third question says "average basket", the tile's name. The Today card shows only once the store has a sale that day. The follow-up chips under an answer are keyed (`ai.follow.*`) and homed in §12. The preview adds a second Kiwi AI frame, a new shop (Atelier Lina: no costs set up, no sale yet, nothing waiting), check 20 and rows 209 to 214.
- **M2, the online orders' home (by hand).** The inbox moves to the top of the Takeaway tab, in three groups (to accept, in the kitchen, ready), with a badge on the rail's Takeaway. The card's acts each name their key in §12's act table. The arrival alert is the shipped two-tone sound under `device.order_sound`, a toast (`online.arrived`), no haptic, a badge pop and an accent ring that fades; under reduced motion there is no pop and no ring, the badge appears at its final size and the toast crossfades. Stage 4 retires `#kop-chip` and `#kop-root`, with `online-inbox-test`. The floor plan is untouched. The preview's till draws the badge (check 16, rows 218 and 219).
- **M3, the quick messages (by hand).** The four shipped messages are one-tap chips above the message field (`till.team.quick`, `.quick_text`). A chip fills the field and does not send, as shipped; measured in three languages (§6.6).
- **P1, `server-ack` (by hand).** §15.2 names the trigger. The AI confirm and accepting an online order fire Commit on the frame the server's yes is applied, within 600 ms. The haptics-map test splits Paid from Commit.
- **P2, "Set a goal" (by hand).** Its own 44-tall row, with the rows below re-derived on the 6.9 and the SE.
- **P3, the compare control (drafted).** Applied, then re-derived in review for P2's no-goal state.
- **P4, Fullscreen (drafted).** Applied as drafted: the native app already hides it.
- **P5, the Till ID's face (drafted).** Changed in review to §1's words, "the Latin face with `tnum`".
- **P6, check 18 (by hand).** It reads the painted mark in both themes: shown up to the frame, a 96 × 4 track, a fill box that is the share of the track from its start edge (the right in Arabic), accent-ink against `--k-line`, and between the key figure and the compare control. Rows 201 to 208 are the critic's eight escapes, and each now turns it red.
- **P7, the captions (drafted).** Applied; the captions for revision 25's changes were written by hand.
- **P8, tnum (by hand).** `home.goal` re-measured with `tnum` (276.2, 303.2 and 264.0 at factor 1, against 273.6, 300.6 and 261.4 without); §6.6 says the census measures with the frame's font features.
- **P9, Stock (drafted).** Changed in review: Stock sits under Shift, open to every role, with its alert count; §10.2's stock-approval row now says what ships (an approval only for a manual movement on a maison or boutique till; the restaurant till's Stock screen asks none).
- **P10, the act entries (drafted).** Changed in review: `till.more.close` and `till.more.cancel_sale` are §9.6 keys.
- **P11, Settings (drafted).** Changed in review: Delivery channels moves to Business, because 2027 has no Integrations group; the Morning briefing is cited at `20f738c4`; Export my data is not shown, because it only shows a toast (`pages-pro.js@31c94529:1487`), so its two drafted rows were removed.
- **P12, the hero line (drafted).** Changed in review: the sentence goes, its two figures stay (margin in Report, break-even as a follow-up), and the four follow-up chips have a §12 row.
- **P13, the Kiwi AI label (drafted).** Changed in review: the capsule re-measured at Callout strong (102.9 wide), the SE venue clearance checked (34 free), the form above 1.35 stated, and check 19 now holds labels (rows 215 to 217).
- **Face ID (by hand).** §10.2 describes `73870f82`: the record is judged by the server, with 7 days offline. The till's relock is unchanged, as decision 16 (§23).
- **The inventory pass (by hand).** At `f432a1de`, 703 shipped actions: 102 are inside a dialog; the other 601 are now all named in §12 by code, with a home, a removal (§22) or a reskin stage. At revision 24, 21 were named and 580 were not.
- **Counts.** §9.6 has 557 rows and 549 Arabic strings (550 and 542 at revision 25; stage 2 adds 7). The 47 new Arabic values were measured at the 9 step and weight pairs in Chrome 155, 423 measurements, and differ by 0 px between the two stacks (§9.6).
- **Preview:** checks 19 of 19 (check 6 retired) and mutations 204 of 204 (15 retired) at 1024 × 768 and 375 × 812, in headless Chrome 155.

**Sources read for revision 25:**
- `docs/audits/design-2026-10/direction-critique-24.md`, in full;
- at `31c94529`: `kiwi-caisse.html:6113-6117`, `:7200-7203`, `:17718-17722`, `:20533-20534`; `assets/orderpro-inbox.js` (the chip, the overlay, `announce`, `warnExpiring`, the card actions); `assets/maison-stock-movements.js:130-133`, `:422-437`; `assets/pos-maison.js` (the `requestManual` callers); `assets/pages-pro.js:1487`; `app/src/native-runtime.css:62`;
- at `319ac100`: `assets/venues.js:974-1022`, `:2078-2093`; `assets/dateRange.js:2601-2625`; `assets/i18n.js:214-216`, `:872-874`; `dashboard.html:4986-4988`; `assets/agent.js:404-409`, `:576-581`, `:747-752`, `:1490-1518`, `:5075-5077`;
- at `73870f82`: `functions/api/pin/verify.js:67-78`, `functions/api/pin/face.js`, `functions/auth/_lib.js:L1238`, `app/src/native-runtime.js:1519-1594`, `:1654-1765`, `:2027-2036`;
- at `20f738c4`: `assets/interactive.js:2220`, `:2550`;
- at `f432a1de`: the inventory script's output over `dashboard.html`, `kiwi-caisse.html`, `kiwi-serveur.html` and every `assets/*.js`, and the handlers each hero row names;
- the preview, run in headless Chrome 155 at 1024 × 768 and 375 × 812, and its widths measured there.

**How revision 24 was written.** By hand: M1 (the till's More keeps every rail function, with a table of where each act starts and a lint rule that holds it), M2 (Home's daily goal and the shipped recommendation), P7 (a presence check), and the three commits `main` landed meanwhile. Then eight polish items drafted by a small model as exact old and new text pairs (P1, P2, P3, P4, P5, P6, P8, P9), each checked against the code and the spec before it was applied; several were changed in review (below).

**What changed for the round 24 critique** ("drafted" marks a pair drafted by a small model, then reviewed):
- **M1, the till's More keeps every shipped rail function (by hand).** Shift gains Open the drawer (manager approval, `act.open_drawer`, shown only when the store's module is on), Team on shift (the live count; a sheet where breaks start and end through `manager-pause` and `manager-resume`, and where one person or the whole team gets a message) and Sales this shift (the shipped journal's three tabs). This device gains Fullscreen (browser tills only, hidden in the native app), Reload the till, Till ID and Sign out. §12's table maps every control of the shipped rail to its row, its preface now says exactly what is removed (Customize only; two Orders tabs `main` removed), and a new table names where each of the 15 `act.*` keys starts, held by `strings-lint`'s act-reachability rule. §12, §18.3, §9.6 (22 rows).
- **M2, Home keeps the daily goal and the recommendation (by hand).** A goal line under the key figure, "82% of the 23,500 MAD goal", with a 96 × 4 mark filled to the share, drawn in the 6.9, Arabic and SE Home frames in both themes; the space is paid by the gaps after the chart and after the tiles (16 to 8), so the first order row stays in full view. The goal is set in Settings › Business and in onboarding's goals step, which is restored (five steps). The shipped "Kiwi Insights" card becomes Kiwi AI's first card, not a Home card: on a real store it is a day summary, which the Today card is, and its chips and input are a conversation; the mic `agent-voice.js` wires onto `.hai-input` becomes the composer's. The fixture gains `goal`; check 18 compares the line and its fill; rows 197 to 200. §18.1, §18.6, §18.8, §18.11, §6.3 (`share`), §6.6.
- **P7, presence (by hand).** "The other two" suggestions is "the other four"; check 19 compares every frame's icons by name and count with the set it is written with, so removing a control turns it red; rows 193 to 196 remove the mic, the Action Center, Calculator and Attach. The not-compared list names a control without an icon, which remains unheld unless a check reads its text.
- **P1, the mic in ink-1 (drafted).** Applied as drafted.
- **P2, the labelled Action Center (drafted).** A capsule with the glyph, "Actions" and the badge; `ai.actions.button`, and `ai.actions.pending_a11y` starts with the visible word. Changed in review: the draft measured EN at factor 1 only and miscounted the free space (150; it is 142.4); the capsule is now measured in EN, FR and AR at factors 1 to 1.35 (§6.6, §18.6). The draft's report that the preview has no Calculator or Attach was wrong: both are in the AI template, and check 19 now holds them.
- **P3, Commit for confirm and undo (drafted).** A §15.3 row: Commit on the response frame of an `ok` settle within 600 ms of the tap. Added in review: the 600 ms include a renewal, and a renewal that answers `replayed` fires Commit too, since the act completed.
- **P4, the price-rise percent (drafted).** Changed in review: the draft wrote an `Intl` call into §9.6, outside `KiwiFormat`, where FR could emit U+202F. §6.3 gains `share` (a part of a whole: unsigned, whole), with three vectors, which the preview asserts; `ai.suggest.price_rise`, the goal line and the card-share tile use it.
- **P5, one Arabic name for VIP (drafted).** The segment's Arabic is VIP, as the marker's is. Changed in review: the glossary note said revision 23; added in review: a §22 line naming the shipped كبار and كبير it replaces, and the AR segment width re-measured (313.4).
- **P6, the renewal's branches (drafted).** Applied as drafted, cited at `agent-action-center.js@319ac100:159-165`.
- **P8, the operational start card (drafted).** Row 6 for a store whose costs are not set up. Changed in review: its four questions are keys, `ai.suggest.ops.*`, the shipped strings as they are, and the row draws the question only, as rows 1 to 5 do.
- **P9, Reconciliation and anti-fraud (drafted, then replaced).** The draft homed them in Report and Cash and Z. `main` removed both tabs in `cda95c04` (phase 1: no acquirer data), so §12 records each as removed there, not homed, and §18.2 says the same.
- **`main` meanwhile.** §6.4 states the Dynamic Type ceiling as `f99fa1e1` ships it (2.0 on the iPhone dashboard, 1.35 elsewhere) and §23 row 4 is narrowed; Settings gains Accountant access (`954bbe18`).
- **Counts.** At revision 24, §9.6 had 526 rows and 518 Arabic strings. The 54 new or changed Arabic values were measured at the 9 step and weight pairs in Chrome 155 (§9.6).
- **Preview, at revision 24:** checks 18 of 18 (check 6 retired) and mutations 186 of 186 (14 retired) at 1024 × 768 and 375 × 812, in headless Chrome 155.

**Sources read for revision 24:**
- `docs/audits/design-2026-10/direction-critique-23.md`, in full;
- at `31c94529`: `kiwi-caisse.html:5950-5998`, `:6000-6150` (the rail), `:6955-6970`, `:16800-16815`, `:17018-17045`, `:17515-17750`, `:18705-18730`, `:20925-20936`, `:21340-21356`; `assets/caisse-refresh.js`; `assets/orderpro-inbox.js:674`; `functions/api/team/live.js:110-215`;
- at `319ac100`: `dashboard.html:4925-5000`; `assets/dateRange.js:644-651`, `:2035-2125`, `:2588-2750`; `assets/insights.js`; `assets/venues.js:4985-5025`; `assets/onboarding.js:73-82`, `:430-452`, `:570-595`; `assets/interactive.js:2176-2183`; `assets/agent-action-center.js:20-190`; `assets/agent.js:575-578`, `:1230-1245`, `:1458-1515`; `assets/agent-voice.js:1-10`, `:270`; `assets/clients-directory.js:54-59`; `assets/pages-pro.js:296-300`, `:355-398`, `:467-473`; `assets/day-report-dash.js:120-130`;
- `git show cda95c04`, `f99fa1e1` (`app/src/native-runtime.js`, `app/src/native-runtime.css:1214-1226`, the plugin's factors) and `954bbe18` (`assets/interactive.js:2222-2240`);
- the preview, run in headless Chrome 155 at 1024 × 768 and 375 × 812, and its widths measured there.

**How revision 23 was written.** First, by hand, the owner's decision: the floor plan is not redesigned and stays as it ships. Revision 21's grid and revision 22's spatial plan are both withdrawn. Everything in this document and the preview that served only that design was removed; what another screen reads was kept, and is named below. No shipped file changes. Then the round 23 critique: M1, M2 and P6 by hand; P1, P2, P3, P4, P5 and P7 drafted by a small model as exact old and new text pairs, each pair checked against the code and the spec before it was applied, and several rewritten (below). Every changed sentence was reread against one question: could one mutation or one line of code falsify it?

**What changed since revision 22, the owner's decision first:**
- **§18.4** is two paragraphs: the plan stays as shipped, cited once, and keeps its current styles. The kit's tokens are all `--k-*` and collide with nothing (§20.7); stage 7 keeps every rule and custom property the plan reads, and §22's paint deletions do not apply to them.
- **Removed, because only the redesign used them:** 24 `floor.*` keys in §9.6 (all but `floor.table`), among them the `floor.tag.*`, `floor.fixture.*` and `floor.table_tagged_a11y` rows; the §9.2 plural rows for seats and tables and the glossary's "Table status"; the six Floor contrast rows (§5.3), the Floor waiter badge target, the Floor primaries row and the floor's §6.6 rows; §10.29's floor table; the lens plan track (§14.4's first exception is back to its revision 21 text) and `floor-tile-fit-test` (§21.1); the floor's haptic changes (§15, §20.3: Light, as shipped); the fixture's room, fixture and seat data (§18.0). In the preview: the after frames, the floor's template and styles, check 6 (retired) and rows 4, 15, 19, 20, 21, 33, 34, 92, 107 and 184 to 188 (retired, numbers kept).
- **Kept, because another screen reads it:** `floor.table` (the bill header), `till.nav.floor` (the rail) and `ia.floor_plan` (the dashboard's navigation); the fixture's `plan`, reduced to which tables exist and in which zone, which checks 2 and 4 read; the status rule, which check 2 reads for the order that settles a table; and rows 48, 137, 152, 158, 163 and 165, moved from a floor table's icon to Orders' #1208 icon so that check 13 keeps its mutations. Rows 1 and 16 now target checks 2 and 4 alone.
- **Recorded:** §22 (a removed part of the direction), §23 (decision 15, decided) and §24.
- **Preview:** the Floor section shows the shipped captures, light and dark, under "Kept as shipped, by the owner's decision."

**What changed for the round 23 critique** ("drafted" marks a pair drafted by a small model, then reviewed):
- **M1, Kiwi AI keeps its shipped features (by hand).** §18.6 draws the mic in the composer (recording, signed-out and fallback states, as `agent-voice.js` ships them), the Action Center in the header with its pending count, a tools row with the calculator and the attach button, and the two simulators as suggestions. The Action Center's sheet is specified from `agent-action-center.js`. §12 gains a table of every shipped function and where it lives. Preview: the AI frames redrawn, the fixture's `aiActions`, check 16 widened, rows 189 to 191.
- **M2, homes for Invoicing and Export (by hand).** Money gains Invoicing and Accounting; the legal A4 invoice opens from an order's detail and from the till's receipt choice (`invoice.a4`); Report's nav bar carries Export, a menu of the printable report, the sales CSV and the detailed day report; Customers' overflow holds Export (CSV), Loyalty program, Retention and Campaign; Home's Day report is the Report tab. Corrected in review: the critique's "gift and team" icons are the shipped loyalty program and retention (§18.5).
- **P6, the wordmark (by hand).** The shipped files, never redrawn, lead Home's nav bar (6.9, SE, Arabic) and head the till's rail, where the shipped dashboard and till show them. §1, §18.1, §18.3, §18.11; drawn in every Home and till frame.
- **P1, the Other method (drafted).** `orders.other` joins the filter, with `sync_alt` for its rows. Changed in review: the draft named it a replacement for Mobile with a phone icon; the shipped method behind both is `wallet`, which the dashboard calls Mobile and the till prints "Virement", so the segment is named "Other", claims nothing about how the money moved, and `pay.other` says "transfer or wallet". Added in review: the fifth segment in the Orders frame, and its width (FR scrolls on the SE).
- **P2, VIP and e-mail (drafted).** The VIP segment and e-mail search come back, as shipped. Changed in review: the key is `customers.segment.vip`, because VIP is not a status. Added in review: the Customers frame, check 9's expected string, row 24's index, row 192, and the five segments' widths (FR scrolls on the SE).
- **P3, the lock's second action (drafted).** `lock.store.open_without` is "Leave this service", true paired or unpaired, in §10.2, difference 6 and R9. Added in review: `lock.store.reload`, which named the old label, now says "Leaving this service…" in three languages.
- **P4, text paint (drafted).** §18.0 and the preview say that the text checks read the text a frame holds. Corrected in review: the draft said only icons are checked for paint; check 1 also compares the deltas' colour and fill with their polarity, so the sentence says so.
- **P5, the icon table (drafted).** Pass only when every file is read and matches; Not run when any file is unread. Added in review: the self-test box now says "not complete" instead of going green on a partial read, and the table counts 38 files.
- **P7, the dashboard's 401 and 403 (drafted).** The designed Read row adopts `main`'s `askServer` since `d004116f`: `unauthorized`, `account-revoked` and a 401 that is not JSON are signed-out, any other 401 or 403 body is `null`; rows for `account-revoked` and a non-JSON 401. Changed in review: the draft made the design copy the shipped shake and enabled keys; the design keeps disabled keys and a Sign in button, because a shake says "wrong code", and names the shipped behaviour as a difference. Citations moved to `319ac100`.
- **Counts.** At revision 23, §9.6 had 492 rows and 485 Arabic strings. The 54 new or changed Arabic values were measured at the 9 step and weight pairs in Chrome 155 (§9.6).
- **Preview, at revision 23:** checks 16 of 16 (check 6 retired) and mutations 178 of 178 (14 retired) at 1024 × 768 and 375 × 812, in headless Chrome 155.

**Sources read for revision 23:**
- `kiwi-caisse.html@319ac100:150-240` (the till's custom properties), `:5363-5470` (the plan's rules), `:8126-8560` (`caisseFloorPlan`, `renderRealGrid`, `setupRealSalle`);
- `assets/floorplan-core.js@319ac100`; `assets/tokens.css`;
- §20.7 of this document, for the kit's token names;
- `docs/audits/design-2026-10/direction-critique-22.md`, in full;
- at `319ac100`: `assets/agent-voice.js`, `assets/agent-action-center.js`, `assets/agent-vision.js:1-13`, `:340-365`; `assets/agent.js:1-10`, `:380-410`, `:1410-1520`, `:2583`, `:4910-4950`, `:5170-5215`; `functions/api/ai/voice.js:45-75`; `assets/invoice.js:1-40`, `:690-823`; `assets/invoicing.js:1-60`, `:515-525`; `assets/pages-pro.js:250-268`, `:20405-20440`, `:20755-20770`; `assets/clients-directory.js:25-62`, `:360-410`; `assets/dashboard-extra.js:1005-1023`; `assets/day-report-dash.js:79`, `:112`, `:944`; `dashboard.html:4680-4682`, `:4855-4870`, `:5005-5020`, `:5931-6085`, `:6425-6450`; `kiwi-caisse.html:6058-6066`, `:6355-6368`, `:7284-7290`, `:15935-15945`, `:16560-16570`; `functions/_middleware.js:615-628`;
- the preview, run in headless Chrome 155 at 1024 × 768 and 375 × 812, and its widths measured there.

**How revision 22 was written.** Two findings were written by hand (1, the second biometric path, and 2, the store lock's exits). Four (3 to 6) were drafted by a small model as exact old and new text pairs; each pair was checked against the code and the spec before it was applied, and several were rewritten (below). Then the owner rejected revision 21's floor ("new plan de salle is terrible"), and §18.4 was rewritten by hand as the revision's first item, with its preview frames. Every changed sentence was reread against one question: could one mutation or one line of code falsify it?

**What changed since revision 21** ("drafted" marks a pair drafted by a small model, then reviewed):
- **The floor (owner; by hand). Withdrawn in revision 23 (owner, 2026-10-13: the floor plan stays as shipped); kept as history.** §18.4 drew the merchant's own plan, from the data the shipped designer stores (`assets/floorplan-core.js@319ac100`: centimetres, rooms, tables with their type, shape, seats and position, fixtures): one uniform scale for the whole plan (1.1818 in the hero, height-bound, so the plan fills the canvas), rooms as one soft surface, fixtures as hairlines, and state deciding emphasis. A free table is an outline with its number; an occupied one is filled, with its elapsed time, amount and waiter's initials; a table that needs someone carries one word (Bill, Late, Ready, Not sent) in the existing warning, danger or accent tokens. The legend is gone. Seats are ticks by the shipped seat rule; tables keep their true shape; text never drops below Footnote 13; each table is a target of at least 44. The forms (Full, Compact, Minimum) are measured per table, with a chord rule for round tables; the plan is not mirrored in RTL while the text inside a table is; opening a table uses the kit's Press, Popover and lens. The fixture's plan is in §18.0; the pane table is recomputed. Preview: both Floor frames redrawn; checks 6, 13 and 17 compare seat ticks, tags, icons, and every room's, fixture's and table's position, size and shape; row 34 rewritten; rows 184 to 188 (AH) added. Also §6.6, §9.5, §9.6 (`floor.tag.*`, `floor.fixture.*`, `floor.table_tagged_a11y`), §10.29 and §14.4's first named exception.
- **F1, the second biometric path (by hand).** §10.2 names the idle relock as a known shipped deviation on both locks: after the native app's 20-minute background reload or the dashboard's idle lock, device biometrics open the page with no code and no server call. Designed: on the dashboard, biometrics are asked only with a Face ID record, and its proof goes to the server first, never `reveal()`; on the till, the relock returns to the staff pad and biometrics never stand in for a staff code. The two `biometric-unlock-test` checks that assert the deviation change at stage 3a (§21.1).
- **F2, the store lock's exits (by hand).** The lock screen gets a second action, `lock.store.open_without` ("Open the till without this service"), which runs the shipped reload; the pad it opens gets a Plain Back (`action.back`), and Escape does the same; `lock.store.reload` no longer assumes a browser. Difference 6 in §10.26, R9 and `lock-exit-test`, the §10.2 and §14.4 rows.
- **F3, Face ID offline (drafted).** The designed Face ID's offline bound states the tiers as the dashboard's cache reads them: an owner's record opens, a manager's only while the list has not loaded, a staff-tier row never. Added in review: the Read row says the same, including that no staff-tier row is written (`:5974`).
- **F4, selection (drafted).** §18.0's "still not compared" list and the preview's claims now say that which segment or tab is drawn as selected is not compared. Changed in review: the wording covers every segmented control and capsule, not one frame.
- **F5, the same-browser pairing fallback (drafted).** §22 lists dropping it on a hosted till as a designed change to `redeem()`, and §10.2 gains the 404 or 405 row (`pin.unavailable`). Kept in review: the key, whose copy does not blame the connection. Added in review: §10.26 difference 1 says this is a behaviour change.
- **F6, "Contact Kiwi" (drafted).** The no-owner-code line is followed by a Plain link to the support page, which the native app opens in its in-app browser. Kept in review: the reuse of `ob.forgot.support`.
- **Counts (history; revision 23 has 460 and 453).** §9.6 had 484 rows and 473 Arabic strings (`floor.table_tagged_a11y`, like `floor.table_a11y`, holds no Arabic letter). Its 11 new or changed Arabic values, in 4 rows, were measured at the 9 step and weight pairs in Chrome 155 (§9.6).

**Sources read for revision 22:**
- `docs/audits/design-2026-10/direction-critique-21.md`, in full;
- `app/src/native-runtime.js@ae45b301:1860-1915`, `:2600-2625`; `assets/idle-lock.js@319ac100`; `kiwi-caisse.html@319ac100:7539-7593`, `:8120-8140`, `:8360-8560`, `:13990-14020`; `KiwiPrinterSocketPlugin.swift@319ac100:360-390`; `tools/biometric-unlock-test.mjs@319ac100`; `tools/check.js@319ac100:1410-1420`;
- `assets/floorplan-core.js@319ac100`, in full;
- `assets/caisse-pairing.js@762bb255:40-50`, `:235-270`; `functions/api/pair/redeem.js@762bb255`; `dashboard.html@a8158aad:5960-5980`, `:6295-6310`, `:6630-6665`; `support.html`;
- the preview, run in headless Chrome 155 at 1024 × 768 and 375 × 812.

**How revision 21 was written.** The owner asked for a new workflow. Five mechanical findings (3, 4, 6, 7 and 8) were drafted in parallel by small models as exact old and new text pairs; each pair was then checked against the code before it was applied, and several were rewritten (below). The three findings that needed judgement (1, 2 and 5) were written by hand. Every changed sentence was reread against one question: could one mutation or one line of code falsify it? The store lock (finding 2) is now written from what `main` ships in `762bb255` rather than designed beside it, which removes most of the lock's own design: where the shipped flow is good enough, it is adopted.

**What changed since revision 20, by finding** ("drafted" marks a pair drafted by a small model, then reviewed):
- **M1, the icon check (by hand).** Check 13 now states what it reads as a closed list of eleven items, "and nothing else", followed by "Not read, by construction: anything outside items 1 to 11", with the known cases named as examples. New reads: a negative `z-index` under a painted ancestor inside its stacking context (item 8, every property that makes a stacking context listed); pseudo-element boxes placed from a containing block computed from every property that creates one, `will-change`, `contain`, `filter`, `backdrop-filter` and `perspective` included, and their coverage summed per icon on a 5 × 5 grid (item 9). The critic's cases A, B and C are rows 180 to 183 (AG), red for the reasons they name; C has both its `will-change` and its `contain: layout` forms.
- **M2, the store lock (by hand).** §10.26 starts from `762bb255`: one "Pair back" button through `repairWithCode`, the service set aside for 12 hours, the `/api/` net, and the reload that leaves the lock. The shipped copy is mapped to eight `lock.store.*` keys, four kept and four changed, each with its reason; five differences are listed, one line of reason each (the pad's answers, two strings, kit styling, focus, language). The lock's own pad, the Why sheet, the 409 `pair-other-store` refusal and the roster step are removed, with nine of revision 20's eleven lock keys; `lock.store.title` and `lock.store.body` keep their names and take the shipped words (§22). §10.2's uses, §14's entrance, §15.3, §21.1, §23 decision 13, check 15 and mutation rows 106, 112, 113, 115, 116, 121 to 123 and 129 to 133 follow.
- **M3, the owner code (drafted).** A "No owner code" row, triggered as `maybeShowNoOwnerHelp` triggers it, with keys enabled, and `pin.dashboard.no_owner_code`. Changed in review: the draft keyed it to the lock opening; it now states the shipped trigger. The shipped "Connect with Kiwi" becomes "Contact Kiwi", marked as a change, and the Arabic names the account as حساب Kiwi, as the bill-and-account lint asks.
- **M4, the offline pause (drafted).** Keys stay enabled and every code goes to the server first; the pause is read only when the server cannot answer, and the line gives the minutes left. Added in review: the 429 row and the `aria-disabled` list said the dashboard's keys are disabled on a 429, which `a8158aad` never does; the dashboard now keeps them enabled there too. `pin.paused.self` is marked as replacing the shipped inline text.
- **M5, Face ID (by hand).** §10.2 names the shipped Face ID unlock as a known shipped deviation (no server call, no expiry). The design: the record holds a server proof, not a code; online, the server's yes comes first; a "no" deletes the record; offline, 7 days from the last yes; an old record is deleted when read. The block's "asked first" sentence now says "for every code typed", and names Face ID's row.
- **M6, the discount act (drafted).** `act.discount.pct` and `act.discount.amount`, picked by the remise's `kind`, with a text vector for each in `strings-bidi-test`. Changed in review: the draft's count edit was dropped (counted below), and revision 18's "14 in all" is left as history.
- **P7, the handover picker (drafted).** The picker lists only entries `KiwiRoles.opensTill` accepts. Changed in review: the rule now states exactly what `opensTill` accepts, the legacy tokens included, and that an entry with no role is left out although the shipped roster labels it "Caissier".
- **P8, "No codes yet" (drafted).** The row says it appears only after a first code is typed, and opens the lock unmatched, as shipped; the till analogy is gone. Checked in review against `:6414` and `:6401`.
- **Counts.** §9.6 has 480 rows and 470 Arabic strings. The 10 new or changed Arabic strings were measured at the 9 step and weight pairs in Chrome 155 (§9.6).

**Sources read for revision 21:**
- `docs/audits/design-2026-10/direction-critique-20.md`, in full;
- `git show 762bb255`: `assets/till-tenant.js`, `assets/caisse-pairing.js`, `kiwi-caisse.html:23050-23220`, `assets/live-link.js:830-1030`, `assets/pos-dispatch.js:105-125`, `functions/api/pair/create.js`, `tools/till-repair-lock-browser-test.mjs`;
- `app/src/native-runtime.js@ae45b301:1470-1660`;
- `dashboard.html@a8158aad:5890-6100`, `:6300-6425`, and `assets/dashboard-pin-vault.js@a8158aad`;
- `assets/staff-roles.js@31c94529:110-175`; `kiwi-caisse.html@31c94529:15405-15425`, `:18045-18175`, `:18795-18815`;
- the preview, run in headless Chrome 155 at 1024 × 768 and 375 × 812.

**How revision 20 was written.** Honesty scored 6 twice, each time for a sentence that claimed more than the code or the test proves. So every sentence this revision touched was reread against one question: could one mutation or one line of code falsify it? Where it could, the sentence was narrowed, or the case was named as not read. Every finding was checked first: `cancelNewOrder` and `cancelOpenTable` close a guest session through the `KiwiOffline` outbox (`orderpro-inbox.js@31c94529:353-371`); R1 forbids the store lock's probe; and the preview's code bears out the icon cases, since its hit test allowed any element inside the icon and its pseudo-element box ignored margins and transforms. The dashboard block was rewritten from `a8158aad`, which landed on `main` after `0268c92f` and answers most of round 20's finding 4.

**What changed since revision 19, by finding:**
- **M1, the store-lock probe.** Dropped. After a redeem with no answer, the pairing pad and the store lock send nothing more and write `pair.no_answer`. Removed from the §10.2 row, R5, the lock's pad text, §15.3 and `pair-redeem-timeout-test`.
- **M2, the needs-connection set.** Classified by code path: `cancelSentTable` with a session or any ticket needs a connection; `cancelOpenTable` and `cancelNewOrder` complete offline and queue the guest session's closing in the outbox. The wrong no-outbox claim for `:13071` is gone. Decision 2 (a) and `till-approval-level-test` match.
- **M3, the icon check.** The hit test now accepts only the icon, its `svg`, its `<use>` or an ancestor, and the pseudo-element box includes margins; rows 178 and 179 (AF) go red. A transform on a pseudo-element, paint outside another element's box, and elements kept out of the hit test are listed as not read, with faint opacities, tiny sizes and a CSS `d`. "What this proves" now says only what the code does.
- **M4, the dashboard refusal.** §10.2 follows `a8158aad`: a `bad-pin` refusal is final outside the demo surfaces; "No codes yet" (the server's `configured: false`) is its own row; the offline pause after five misses is its own row. `dashboard-pin-migration-test` matches.
- **Owner decision 14** is recorded as decided on 2026-10-13: (a) and (b) accepted.
- **Polish.** P5: on the shift change, `pin.till.not_incoming` takes precedence over `pin.till.not_till`, in the rows and the test. P6: the manager-level "says so before the code is typed" clause is deleted; the row now says what ships and what replaces it. P7: on a pad, the retry after a 503 is the code typed again; Try again only applies to the roster step. P8: only a `bad-pin` and a staff-tier 200 erase a dashboard row; `unauthorized` shows `pin.signed_out` and keeps it. The shipped difference is stated, and the test covers both.

**Sources read for revision 20:**
- `docs/audits/design-2026-10/direction-critique-19.md`, in full;
- `git show a8158aad`: `dashboard.html:5880-6432`, `assets/dashboard-pin-vault.js`, `functions/api/pin/verify.js`, `functions/auth/_lib.js:L1386-1456`, `assets/tenant-purge.js`;
- `kiwi-caisse.html@31c94529`: `:8224-8238`, `:10918-10956`, `:12960-13095`;
- `assets/orderpro-inbox.js@31c94529:340-375`;
- the preview, run in headless Chrome 155 at 1024 × 768 and 375 × 812.

**How revision 19 was written.** The coordinator's convergence rule set the method: for each pad state, the outcome the person sees, the invariant, one cite, and nothing more; a claim the code does not bear out is cut, not defended. Every finding was checked at `31c94529` first, and all nine hold. Two of the suggested fixes needed adjusting, and the body says why: `requireTillOperator` and `requireManager` are local to the page script, so wrapping their `window` names cannot count the till's own callers, and the census records each opening of the authorization modal instead; and the pairing checks the critique names both need the store's name, which a till pairing for the first time does not know yet, so the check applies to the store lock only (rebuttal 4, in part). The dashboard block was rewritten from the two shipped commits, read in full, and it no longer designs anything of its own.

**What changed since revision 18, by finding:**
- **M1, the needs-connection set.** "Needs a connection" now means the act's effect is a server write with no outbox. The set is the shift change, cancelling a live order, rejecting an online order, cancelling a table with a session or any ticket (`:12987-12990`), and removing an order from tracking. Only a table with neither is cancelled locally. The till-approval table gives each act its Offline outcome; `till-approval-level-test` asserts exactly this set.
- **M2, the handover.** Its own sub, `pin.till.handover_sub` ("Sara confirms with their personal code."), and its own refusal on the pad, `pin.till.not_incoming`: dots danger, keys enabled, Failed within 600 ms, the pad stays open. "Who may approve" says the incoming cashier only. The test is in `till-approval-level-test`.
- **M3, retries.** An approval never retries by itself. Its network row offers Try again only, with the digits kept; the row, the retry rule and `pin.till.needs_connection` say the same.
- **M4, single-use codes.** A redeem is never sent again by itself. The store lock asks `/api/pair/state` for its store after a redeem that got no answer; otherwise `pair.no_answer`, and a 422 to the same code typed again is `pair.maybe_used`. Server idempotency by `terminalId` is named as an engineering option. `pair-redeem-timeout-test`.
- **M5, the icon check.** The preview now reads the `use`'s position and size, the `svg`'s viewBox, the drawn glyph's box, strokes, shadows and background images on the chain, positioned painting pseudo-elements, the legacy `clip`, an inward outline, and `-webkit-text-fill-color` in check 1. Rows 167 to 177 (AE) are the critic's cases A to G, the text fill and three more; each goes red. The claim says what is proven and lists what is not read.
- **Dashboard.** §10.2's block, §22, §23 decision 2 (b) and `dashboard-pin-migration-test` follow `4dcd0685` and `0268c92f`. Owner decision 14 holds the two points of the shipped design the owner may want changed.
- **Polish.** P6: the till approval's success defers to the close row. P7: `clock.code.sub` says "every few minutes". P8: the authorization log's till-level entries are a requirement, asserted by `offline-verifier-test`. P9: callers are counted at run time.

**Sources read for revision 19:**
- `docs/audits/design-2026-10/direction-critique-18.md`, in full;
- `kiwi-caisse.html@31c94529`: `:10903-10912`, `:12272-12292`, `:12976-12998`, `:16378-16450`, `:16990-17012`, `:17282-17286`, `:17315-17346`, `:17400-17410`, `:18895-18910`, `:19020-19027`, `:21134-21160`;
- `assets/orderpro-inbox.js@31c94529:238-310`; `assets/maison-stock-movements.js@31c94529:425-434`; `assets/caisse-attendance-code.js@31c94529`;
- `functions/api/pair/redeem.js@31c94529`, `pair/state.js`, `pair/recover.js`, `functions/api/config.js:170-215`, `functions/api/team/live.js:160-175`;
- `git show 4dcd0685` and `0268c92f`: `assets/dashboard-pin-vault.js`, `dashboard.html:L5844-L6430`, `assets/tenant-purge.js`, `assets/identity.js:85-102`;
- the preview, run in headless Chrome at 1024 × 768 and 375 × 812.

**How revision 18 was written.** The coordinator warned that this critique's evidence was thinner than earlier rounds', so every finding was checked against the code at `31c94529` before anything changed. Nine of the ten held:
- the handover's proof (`confirmHandover`, the verifier row with no `actorProof`);
- the verifier's lag;
- the missing act keys and the Arabic grammar;
- the focus loss;
- the attendance code's 5 minutes;
- the close's 8 s wait;
- the two vertical callers;
- `59392a9c` on `main`.

Following the proof further found two more acts that need a connection (`queue.js:846` and `:2010`) and two more callers (`pos-boutique.js:2085`, `maison-stock-movements.js:432`). One part of one finding does not hold, and it is answered in the rebuttals (3): the clock-in time cannot be kept, because what the attendance code proves is presence when the server accepts it. Following the scope guidance, the shipped mechanisms are stated briefly, and each new state is written with its entry, its exits and a test.

**What changed since revision 17, by finding:**
- **M1, what the icon check reads.** The icon test now also requires, on every element from the `<use>` up to the frame, that `clip-path`, `mask`, `filter`, `mix-blend-mode` and `content-visibility` are unset. It also checks:
  - that the sprite path sets nothing it does not inherit;
  - that the icon lies inside every box that clips it;
  - that its colour stands at least 3:1 against its background;
  - and, with the frame hit-tested on screen in one task, that nothing covers it.

  The spec and the preview now say exactly what is read, and what is not, because this is not a pixel test. The two coverings allowed by design are named. Mutations 156 to 166 add one row per class, and all 166 rows go red. The sweep caught 1,910 of 1,918 cases; the 8 left are named, and are left out by the stated rule.
- **M2 and M3, acts that need a connection.** The shift change, cancelling a table with a server visit, and removing an order from tracking refuse without the server's `actorProof`, which a verifier row cannot hold. Their till approval never consults the verifier. Offline, the pad opens in a **needs-connection state** before any code is typed:
  - the keys are drawn but cannot be used;
  - the message is `pin.till.needs_connection`;
  - there is no haptic and no success;
  - the state ends on `online` or on a successful request (`pin.connection_back`), and Close leaves the act's sheet unchanged.

  §23 decision 2 no longer claims an offline handover.
- **M4, staleness.** The verifier's lifecycle gains a Staleness row: an offline verdict is "proven online within 7 days, may be stale". Every offline verdict records `verdict: 'offline'` and its proof time, in the act's identity, in the authorization log and in the haptics trace. §23 decision 2 names the revocation lag, a role lowered included, as the owner's risk.
- **M5, the act phrases.** There is one `act.*` key per act, 14 in all, in EN, FR and AR: a gerund or noun phrase in EN, a noun phrase with its article in FR, a verbal noun in AR. Every `{act}` template now reads grammatically. FR uses "Autorisation" at both levels. The glossary gives the closure's act (إغلاق الصندوق) and its button (أغلق الصندوق) as two rows. A new "Act phrases" lint holds all of this.
- **M6, focus.** An unusable key is `aria-disabled`, never `disabled`: it keeps focus, ignores activation, and its state is announced once through the pad's existing regions. This agrees with the M3 rule of revision 17. `pin-focus-test` holds it.
- **M7, clock-in expiry.** Once 5 minutes have passed since the code was typed, automatic retry stops and `clock.code_expired` is written once. That message points to the till's new code and says when the time is recorded. `clock-expiry-test` holds it.
- **Polish.**
  - P8: Paid fires on the frame the closing is committed (`registerClosed`). The wait for the sales feed before that commit is the sheet's quiet busy state.
  - P9: §10.2 lists every approval caller with file and line, the two vertical ones included, and `till-approval-level-test` fails on a caller missing from the list.
  - P10: the `pinVenue` item is marked shipped in `59392a9c` (`activeVenue`, `resetPinState`). The dashboard's plaintext task is still in progress.

**Sources read for revision 18:**
- `docs/audits/design-2026-10/direction-critique-17.md`;
- `kiwi-caisse.html@31c94529`: `:12985-13015` (cancel a table), `:16333-16466` (the close), `:17319-17410` (the authorization modal, `mgrApprove`), `:17445`, `:18880-18915` (`confirmHandover`), `:19015-19030`, `:21353`;
- `assets/caisse-pairing.js@31c94529:75-99` (a row holds id, name and role, no proof) and `:894-924`;
- `functions/api/order/queue.js@31c94529:815-860`, `:1995-2012` and every use of `pinActor`;
- `functions/api/team/live.js@31c94529:169`; `functions/api/employee.js@31c94529:478-530`;
- `assets/pos-maison.js@31c94529:4460-4480`, `assets/pos-boutique.js:2085` and `assets/maison-stock-movements.js:420-440`;
- `git grep` at `31c94529` for every approval caller;
- `59392a9c` on `main` (`git show`; `origin/main:assets/caisse-pairing.js:596-601`); `origin/main:dashboard.html` still compares `kiwiPins` locally;
- the preview, run in Chrome 155 at three viewports, with the sweeps described in §18.0.

**How revision 17 was written.** Round 16's first major came from a comment that described its code wrongly. Round 17's first two came from reading one function per surface and stopping there. So revision 17 read every caller instead, at `31c94529`: each call that opens the till's authorization modal, and the one in `orderpro-inbox.js`, which found the till's second approval level; and every place the dashboard reads a code, which found the plaintext `kiwiPins` and a lock that compares them before it asks anyone. The third major was a rule written for the roster step and never for the pad, so the retry rule is now written once and both point at it. The fourth was a check that compared a reference with itself. Revision 17's checks read the drawing: the path data against the vendored files, the transform chain, the fill where it is painted, the visibility and opacity of every ancestor, and the change's computed colour. Each is broken by a mutation of its own.

**What changed since revision 16, by finding:**
- **M1, two approval levels.** §10.2 has eight uses. The **till approval** (`pin.till.title`, and `pin.till.sub`, which names a cashier, a manager or the owner) covers the eleven `requireTillOperator` call sites and the online-order rejection in `orderpro-inbox.js:243-247`. The **manager approval** covers the drawer without a sale, discounts, refunds, stock adjustments and sale cancellations. Each act is listed with its call site. A new response row, "200, but the role does not open the till", covers the till lock (`pin.not_till`, which names the person as shipped, and `pin.not_till.unnamed`) and the till approval (`pin.till.not_till`). The offline rows are split by level, and the verifier's lifecycle says rows are written for any role. §15.3 gives a cashier approving a till act the act's own class, and Failed for a role refusal. `pin.manager.sub` is used at the manager level only.
- **M2, the dashboard lock.** §10.2 states what ships. Plaintext codes sit in `localStorage.kiwiPins`, written at onboarding, and the lock compares them in the browser before it asks the server. Online, that lets in the owner's code; before the configuration loads, and so offline, every owner or manager code. Either way, this direction removes the plaintext and the local-first comparison, migrates existing values once, and asks the server first. Owner decision 2 gains a part (b): keep offline owner unlock through a verifier like the till's (the default), or remove it. Revision 17 also adds:
  - the new key `pin.dashboard.offline_unknown`;
  - the dashboard's own offline rows;
  - §22's entries;
  - `dashboard-pin-migration-test`.

  It corrects the Rules (which now list `/api/employee` too), `pin.offline`, the lint's rationale and revision 16's Sources line. The engineering task that replaces the plaintext storage now is cited as in progress, not shipped.
- **M3, automatic retries.** §10.2 states one retry rule. An automatic retry writes nothing unless its cause changes. A Try again is the person's, and so is an automatic request it joins: their answer is announced even when unchanged. `pin-announce-test` asserts the silence.
- **M4, the drawing.** Check 13 hashes the path data of each sprite symbol and compares it with the vendored `assets/icons/material/<name>.svg`. The table is generated from those files, and the kit self-test re-reads them (35 of 35 match). In both themes, check 13 then reads every icon's computed style from its `<use>` up to the frame:
  - the transforms (only §9.5's `scaleX(-1)` on a mirror-allowed icon);
  - the fill, on the `<use>` and its `svg`;
  - visibility, opacity, scale and rotate;
  - the icon's size.

  Check 1 reads the computed colour of each change's text and of each arrow's `<use>`. Mutations 143 to 155 are the critic's cases plus two the same holes allowed, and all go red. A sweep of five changes on each of the 132 icons, plus one replaced path for each of the 35 symbols, caught 695 of 695. The preview's description and claims say exactly this.
- **Polish.**
  - P1: `pin.offline_unknown` says the code can't be checked offline on this till.
  - P2: `pin.offline` says the code can only be checked online, which fits every use.
  - P3: §15.3 drops "codes are online-only", and an offline verdict gets its haptic and trace.
  - P4: one 8 s timeout and one retry timer serve the pad and the roster step.
  - P5: the census rule observes what is requested, and names stage 1's deliberate Plex overlap.
  - P6: owner decision 2 says the till opens whenever the staff list cannot be loaded.
  - P7: rebuttal 2 is reworded.

**Sources read for revision 17:**
- `docs/audits/design-2026-10/direction-critique-16.md`;
- `kiwi-caisse.html@31c94529`: `:17319-17353` (`requireManager`, `requireTillOperator`, `openAuthorization`, `managerCodeValid`) and every call site, `:10907`, `:10924`, `:10943`, `:10951`, `:13026`, `:13071`, `:16468`, `:16995`, `:17026`, `:18166`, `:18382`, `:18543`, `:19024`, `:21160`, `:21352`; `assets/orderpro-inbox.js@31c94529:240-248`;
- `assets/caisse-pairing.js@31c94529:763-779` (`acceptStaff`) and `:936-962`; `assets/staff-roles.js@31c94529:156-170`; `functions/auth/_lib.js@31c94529:1251-1292` (`requireTill` is the device check, not the role); `functions/api/pin/verify.js@31c94529:30-70`;
- `dashboard.html@31c94529`: `:5858-5891` (`allPins`), `:5926-5950` (`askServer`), `:5957-5959`, `:5985` (`isPreviewCode`) and `:6345-6385` (the unlock);
- `assets/onboarding.js@31c94529:640-680` and `:903`; `assets/tenant-purge.js@31c94529:20-40`; `functions/api/store.js@31c94529:500`, `:686-687`;
- `git grep` at `31c94529` for every other browser-side comparison with a code: `team.js:4450` deduplicates an onboarding import and unlocks nothing, and `kiwi-admin.html:1544` is the operator console refusing a duplicate;
- `assets/icons/material/*.svg`, the 35 files whose path data the preview hashes.

**How revision 16 was written.** The first major was a premise taken from the code's own comments instead of from its code: `caisse-pairing.js` says twice that no code is compared in the browser, and three functions below those comments do exactly that, offline, against a salted verifier. Revision 16 read every code door of the till at `31c94529` (`verifyCode`, `askStaff`, `authorizeTill`, `authorizeManager`, the stock movement's approval) and wrote what each does offline before writing a single row about it. The second major was a check that read a label instead of the drawing; revision 16 reads the glyph and the paint, and proves it by pointing each of the 132 icons at another symbol, one at a time. The third gave the PIN pad's refusals a stated region and politeness, so a VoiceOver cashier on an iPad, which has no haptics, hears every refusal.

**What changed since revision 15, by finding:**
- **M1, offline codes.** §10.2 states the shipped offline verifier in a lifecycle table (what a row holds, written, limits, read, uses, deleted, scope, revocation) and gives one network-error row per use: the till lock (match, no match, no row), the manager pad for acts approved by role, and for acts the server must approve (refund, stock adjustment, sale cancellation), and the surfaces with no offline check. New key `pin.offline_unknown` in three languages; `pin.offline` and `pin.manager.offline` are scoped to where they are true. Owner decision 2 now asks the real question (keep or remove offline unlock and offline approval), with keep, as shipped, as the default and the reason; §22 lists what goes if it is removed. The codes lint's rationale is corrected. R10 requires that no other store's code reaches a held service, online or offline; the store lock never touches the verifier (its pad takes pairing codes), and the engineering box names the one shipped gap, `pinVenue` never cleared at a re-pair (`caisse-pairing.js:584`, `:650`, `:656`, `:896`).
- **M2, icons.** Check 13 first requires every icon of every frame to draw the symbol its label names, read from its `<use>`; checks 1 and 13 read glyphs, never labels; check 1 compares each Home arrow's painted colour and glyph fill with its polarity, in both themes. Mutations 134 to 142 redraw or repaint and never touch a label; a sweep of all 132 icons is caught 132 times.
- **M3, announcements.** The PIN pad's message row is a live region pair, present and empty at load, written once per answer, polite when the keys stay enabled and assertive when they are disabled, with every key listed. R8 and the pad-step rule now allow each step its own regions. `pin-announce-test` asserts each refusal is announced.
- **Polish.** R6 asserts focus on the title for the pair-back request, and on Try again only after it is pressed (P1). Try again appears with the first failure, in a reserved slot (P2). The retry timer runs from the end of each request, an `online` event during one is ignored, and a joined request counts as the cashier's (P3). The roster lines say "Keep it open without reloading it" instead of promising a lock a reload breaks (P4). The census rule is per weight and per character, and allows the two Inter Tight subsets by name; §6.1 and the preview declare Latin Extended before Latin, as fontsource does (P5). §14.4 and §14.5 give the exit into the till its fade (P6). §6.1 says the preview's file names differ too (P7). The SE status bar is drawn at 13 px, Footnote (P8).

**Sources read for revision 16:**
- `docs/audits/design-2026-10/direction-critique-15.md`;
- `assets/caisse-pairing.js@31c94529`: `:32-33`, `:50-99` (the verifier), `:584`, `:636-660` (`askStaff`), `:753-794` (the till pad's submit and its offline message), `:887-963` (`verifyCode`, `authorizeTill`, `authorizeManager`);
- `kiwi-caisse.html@31c94529`: `:17302-17396` (the manager modal and `managerCodeValid`), and the gates at `:16468`, `:16995`, `:17026`, `:18166`, `:18382`, `:18543`, `:19024`, `:21160`;
- `assets/maison-stock-movements.js@31c94529:425-450` (the stock approval and its undo);
- `git grep` at `31c94529` for any other offline code check. Revision 16 reported none and said `dashboard.html` and the employee app ask the server only; **that was wrong for `dashboard.html`**, which compares plaintext codes in the browser (round 17, M2, corrected in revision 17, §10.2). The employee app does ask the server only.

**How revision 15 was written.** The three majors shared a cause: a rule stated once in the prose and differently in the place that enforces it. The roster step's `rosterPending` was set at pair-back in the predicate and after a failure in the table and the preview; the roster copy described a mechanism (codes sent to the till) that the server does not have; and the coverage test counted a `local()` face as covering what its platform font may lack. Revision 15 writes each rule once and makes the enforcing place read it: one definition of `rosterPending`, used word for word by the predicate, the lifecycle table and check 15; copy that says only what failed, held by a lint that fails revision 14's table; and a coverage test that trusts a `local()` face only where a capture of the real font shows the glyph. Every count it prints (rows, Arabic strings, characters, measurements) was generated by a script from the table, not typed.

**What changed since revision 14, by finding:**
- **M1, the roster step.** `rosterPending` has one definition (§10.26): set at the pair-back, before the request is sent; cleared only by a verified roster (2xx, JSON, a `pins` array). While the first answer is awaited the step shows `state.checking` and no cause line. The request is aborted after 8 s, which reads as no connection; a body that is not JSON (a captive portal's page) reads as a server error, with `pinsFor`'s `SyntaxError` gap named. Check 15 computes `rosterPending` with one function from the roster's answer, gains three codes (in flight, timeout, not JSON) and a till whose roster is verified, and checks the step's line; mutations 129 to 133 break each. No Cancel is added, and why is stated (Rebuttals, 2).
- **M2, honesty.** `lock.roster.no_connection` and `lock.roster.server_error` now say the till could not load the store's staff list, in EN, FR and AR, and never mention codes. A grep of every §9.6 row found no other such claim. §9.6 gains a lint table whose first rule fails a code term in `lock.roster.*` and a personal-code term beside a verb that puts codes on the device; the glossary gains "Staff list".
- **M3, coverage.** `font-coverage-test` reads every character the kit can emit (strings in three languages, every `KiwiFormat` output, the fixture: 141 characters), and counts a `local()` face as having a glyph only where `tools/fonts/local-faces.json`, captured from the real font per platform, shows it; an uncaptured platform covers nothing. It checks the loaded state and the swap. U+202F is banned, not added (§6.1, §6.3, §9.6's lint), and French high punctuation uses U+00A0, coherent with that ban (P7).
- **Polish.** R1 states its scope once (P1). R9 is qualified for the roster step before and after an autosave (P2). The unreachable offline-copy branch is removed, with `caisse-pairing.js:221` and `:376` cited (P3). Try again stays focusable with `aria-busy` and focus stays on it; the step's line is its own polite region (P4). The lock's body and cause line are Body ink, 1.4 and 1.6 (P5). Every interpolation is a `<bdi>` in the DOM and FSI/PDI in attributes, held by `strings-bidi-test` (P6). 24 FR rows gain U+00A0 before `? ! ; : »`, with a lint (P7). AR الحساب is the bill only, an account is حساب Kiwi, الفاتورة is gone, with a lint (P8). Check 1 reads the Home key figure's and the basket tile's units, and the Arabic key figure uses U+00A0 like the English one; mutations 125 to 128 (P9). Android's missing Arial is an accepted first-visit shift, with the measurement and the remedy named (P10). The app shell's stacks are quoted in full and audited family by family (P11). `--k-dur-3` lists the lock's entrance (P12). §6.1 gives the exact `@font-face` block and the preview declares it, checked descriptor by descriptor and by file size (P13). The Arabic corpus count has a stated rule and is generated: 443 strings, 3,608 measurements (P14).

**Sources read for revision 15:**
- `docs/audits/design-2026-10/direction-critique-14.md`;
- `assets/caisse-pairing.js@31c94529:215-224` and `:372-378` (the offline pin key deleted at a switch and at unpair, P3) and `:618-660` (`pinsFor`, `askStaff`, M1);
- `functions/api/config.js:11` (the roster carries names and roles, M2);
- `app/src/native-shell.css:4-7`, `:13` and `:29`, and `app/src/native-runtime.css:1-8` (P11);
- the cmaps, read with fontTools, of every `@fontsource-variable/inter-tight` subset (none has U+202F), of `ibm-plex-sans-arabic-arabic-400-normal.woff2`, of `/System/Library/Fonts/Supplemental/Arial.ttf` and of the iOS 26.5 simulator runtime's `WebFonts/Arial.ttf` (M3);
- the only Roboto files on this machine, Roboto Light and Thin inside an Android tool's bundled Java runtime (P10);
- §9.6 itself, parsed by script for the lints, the counts and the corpus (M2, P7, P8, P14).

**How revision 14 was written.** The blocker was a font claim that held for each face on its own and failed for the stack. A browser picks a face per character, and a `local()` face carries every glyph of the platform font, so an Arial fallback with no range took every Arabic letter before Plex was reached. Revision 14 fixes the stack and makes the preview draw in exactly that stack. It replaces "the face it renders in" with a rule a test can apply: each character is resolved through its stack by the declared ranges, and a `local()` face counts as covering its whole declared range. It audits every stack by that rule: the kit, the legacy tokens, the app shell and the preview (§6.1). It re-measures every Arabic width in §6.6 under the corrected stack. The major was a state the lock reached without naming it. Revision 14 names it in the lifecycle, gives it its own copy, focus and announcement, and writes the lock's predicate once, in words that check 15 runs as written.

**What changed since revision 13, by finding:**
- **Blocker.** "Inter Tight Fallback" is limited to Inter Tight's own Latin and Latin Extended ranges, and the kit stack puts Kiwi Arabic before it: `"Inter Tight", "Kiwi Arabic", "Inter Tight Fallback", system-ui`. Either change alone gives Plex, and that was measured. `kit-in-host-test` measures "مقعدان" in a kit root on the Arabic host against Kiwi Arabic alone: 51.69 px at 400 17 in Chromium 152, where revision 13's stack gave 34.98 (Arial). `label-fit-test` logs a second reference label, `bill.send` in Arabic at Body strong, 136.4. `font-coverage-test` resolves each character through its stack instead of asking whether some face has the glyph. The preview declares the fallback face as shipped and sets every frame in the shipped stack. Its kit self-test measures the Arabic word against Plex, with revision 13's stack as a negative control. Every Arabic width in §6.6 was re-measured under the corrected stack, and all of them stand (§6.1, §6.3, §6.6, §20.2, B1).
- **Major.** The lock has two steps, both named in its lifecycle. In the **pad step**, the service's store is not the paired one. In the **roster step**, the lock's own pad has paired the till back, and the store's roster is not verified yet. The roster step has:
  - no pad and its own title;
  - one cause line per failure: no connection, or a server error;
  - one action;
  - its own focus rule.

  The "when, and only when" sentence names both steps, and R1 lets the roster request through in the roster step. Check 15 gains the case and two pad outcomes, held by mutations 121 to 123 (§10.26, §9.6, §10.2, §18.0, M1).
- **Polish.**
  - P1: the claim that an unpaired till restores any service blob is withdrawn. The unpaired variant is reached only by `unpair()` with a service open.
  - P2: §6.5 and the stage 1 row limit the Next-chunk change to Arabic at 400 to 600, and the census test's in-browser samples name their weights.
  - P3: one predicate, written in §10.26, is used by every case of check 15. A service with no store is left out by name; mutation 124 holds it.
  - P4: check 13 reads each Orders row's method icon from the log, and check 10 reads each bill line's group from its drawn position; mutations 118 to 120 hold them.
  - P5: mutation 101 uses the current rows, and the preview reports why each mutation goes red.
  - P6: §10.2 has a row for a store with no staff codes.
  - P7: `lock.store.why_body_unpaired` is added, and the Arabic says دفاتر for books, never الحسابات.
  - P8: the chart's label lists `chart.summary_same`.
  - P9: the lock's entrance is in §14.4, with its reduced-motion row in §14.5.
  - P10: the rebuttals paragraph is rewritten.

**Sources read for revision 14:**
- the font ranges and coverage (B1):
  - `app/node_modules/@fontsource-variable/inter-tight/index.css:58` and `:68`, the two file ranges;
  - the cmaps of `inter-tight-latin.woff2`, of `ibm-plex-sans-arabic-400.woff2` (the app's `native-fonts/` copy, byte-identical to the preview's) and of `/System/Library/Fonts/Supplemental/Arial.ttf`, read with fontTools;
- the stacks (B1): `assets/tokens.css@31c94529:125-130` and `:153`, the legacy stacks; `app/src/native-runtime.css:1-8` and `app/src/native-shell.css:4-7`;
- `assets/caisse-pairing.js:621-660`, which holds `pinsFor` and `askStaff` (M1, P6);
- `assets/pairing-commit.js:92-95` (M1);
- `kiwi-caisse.html:15710-15752`, `:22484-22487`, `:22520-22522` and `:22794-22807` (P1, P3).

**How revision 13 was written.** The store lock produced most of the majors of rounds 11 to 13, and it is tenant-safety engineering more than design. On the lead's scope decision, a separate engineering task now owns it, and §10.26 item 3 keeps only what a design direction should hold: what the cashier sees and can do, the copy in three languages, focus, announcement and haptic, the exit to the store's staff pad, nine requirements written as outcomes a test can observe, the tests by name, and one short engineering-dependency box that states requirements, not code. Revision 12's gate internals, its parked service and its "Pair a different store" exit are gone; removing the parked state also removes the findings that came from it (M2, M3, M6, P8, P10, P12). Revision 12's method stays: where a set has to be known, a script or a test finds it.

**What changed since revision 12, by finding:**
- **Blocker.** The lock is keyed on an open service (`shiftOpenedAt`, not closing), never on `shiftMerchant`, which is set at load and never cleared; an idle till re-paired or unpaired goes to the new store's staff pad or to the pairing pad (R2); check 15 gains four lock cases, two of them idle, and mutations 111, 114 and 117 (§10.26, §18.0, B1).
- **Majors.** The lock's requirements are stated without code; one of them (R4) says the send functions behave exactly as shipped on pages without the lock, held by a unit test with no lock code loaded (M1). The parked service, its row and its "Pair a different store" trigger are removed, which resolves M2, M3 and M6. The lock never affects another page, the kitchen screen, the app shell or the dashboard, and `tenant-gate-test` opens the kitchen screen on the same origin while a till is locked (R3, M4). The census reports the Plex weights each page requests; 200 and 300 map to 400 and 700 to 600 when a page's Google source goes, stated per class with the pages it changes; the Next-chunk pages' stage 1 change is limited to Arabic at 400 to 600; the two-URL rule is scoped to overlapping ranges (§6.1, M5).
- **Polish.** 409 `pair-other-store` is a Failed haptic and a §10.2 state, and the pairing states name the lock as a use (P1, P2). The lock's pad has no same-browser fallback and says `pin.offline` when offline (P3). The exit never opens the service without a verified roster; a store with no staff codes by choice is the one stated exception (P4). Check 15 derives the pad's answers and the exit from sources (P5). The held-entry paragraph names its two reasons (P6). AR `lock.store.why_body` uses الحساب (P7). P8, P10 and P12 went with the parked service. `ai.today_same` and `chart.summary_same` cover a change that rounds to zero (P9). The garbled §18.0 sentence and the preview's "Home in Arabic (RTL, dark)" are fixed (P11). P13's gate citations went into the engineering task with the gate; the app-bundle run of `tenant-gate-test` is in R1.

**Sources read for revision 13:** `kiwi-caisse.html:14014`, `:15749`, `:16189`, `:16305`, `:22690-22693`, `:22827` (the open-service flag, B1); `assets/caisse-pairing.js:639-660` (the roster fallbacks, P4); every `*.html` at `31c94529` with the Google `wght@` lists of their Plex sources (M5).

**How revision 12 was written.** Two of the round 12 majors had the same cause: a list presented as complete that was not (revision 11's table of store-keyed calls, and its count of Plex pages). So wherever it could, revision 12 replaced the list with **a mechanism and a test that discovers the set**: one gate inside the page's network exits instead of a table of call sites, a network-observing test instead of a list of endpoints, and a committed census script instead of a page count. Where a table remains (the gate's categories, the census output), it is labelled as a reading of the mechanism, not the rule.

**What changed since revision 11, by finding:**
- **Majors.** `KiwiTenantGate` (`assets/tenant-gate.js`), loaded first on every page that loads `pairing-commit.js`, wraps the same five browser exits that the shipped `assets/api-base.js` wraps, and refuses every `/api/` and `/auth/` request but `/api/pair/redeem` and `/api/pair/recover` while the lock is up; `postSale` and `postRefund` check it inside themselves; a category table replaces the call table; the shipped `recover`, `flush(true)`, `bootWithPin(B)` path is replaced by the lock (§10.26, M1). `tenant-gate-test` observes the network through the DevTools Network domain and asserts only what the page controls; the HttpOnly till cookies are named out of scope (§10.26, §21.1, M2). The lock's exit is A's staff pad with focus on its title; the staff gate is never skipped; an open pane records the cashier it captured when it opened (§10.26, §10.2, M3). The delta rule has a scope: a figure gets an arrow and a sign, a sentence gets an unsigned value and a direction word, and the cash Difference is a balance, a named exception; check 1 holds both forms (§6.3, M4). `tools/plex-census.mjs` classifies every HTML page by how it gets Plex, and its output at `31c94529` is 52 pages; the 11 Next-chunk pages get the self-hosted face after the chunk, so it wins over the `@import`; `font-face-census-test` runs the script (§6.1, §6.5, §21.1, M5).
- **Polish.** The lock's title is Heading (P1). §18.3 points at §10.26's visibility rule (P2). Stage 4 says a code that is not A's is refused and the lock stays (P3). Stage 3a refers to §10.2's list of uses (P4). Home in Arabic is drawn in light too, and §18.0 says what the preview checks and what it does not (P5). The self-test intro names W and X (P6). `lock.store.memory` names whose sales, and FR uses "verrouillée" and "déverrouille" (P7). The lock's pad takes only A's code, through an `expectMerchant` check in `/api/pair/redeem` that does not use the code up; "Pair a different store" parks A's service, which row 9 shows (P8).

**Sources read for revision 12:**
- `assets/api-base.js:1-120` (the five wrapped exits), `tools/build-app-www.mjs:45` (`API_BASE_TAG`), `assets/auth-guard.js:37`, `assets/entitlements-v2.js:40`, `assets/err-reporter.js:43-52`, `:109`, `kiwi-sw.js:406-409`, and the pages that load `pairing-commit.js` (M1);
- `assets/caisse-pairing.js:220-258`, `:296-325`, `:527-538`, `:662-664`, `assets/pairing-commit.js:92`, `:100`, `assets/live-link.js:805`, `:972-979`, and `functions/api/pair/redeem.js:109-189` (M1, M3, P8);
- `functions/auth/_lib.js:377-381` (M2);
- every `*.html` that `git ls-files` lists at `31c94529`, with the stylesheets each links and their `@import`, `_next/static/chunks/1d07ha593kf43.css:1` and `_headers:28-35` (M5).

**How revision 11 was written.** The round 10 method still holds (define a state's whole lifecycle in one place before adding it, and prefer fewer states), and revision 11 applied it to the finding that needed it most: the other-store state. Instead of a banner, a disabled Charge, a row and an action that each needed their own rules, the state is now **one screen, the store lock**, with one predicate (`tenantMismatch()`) that every store-keyed call asks, one lifecycle table, and one exit. Two strings (`sync.not_saved_store`, `sync.pair_back`) and one sync row are gone as a result.

**What changed since revision 10, by finding:**
- **Majors.** A till re-paired or unpaired with a service open shows a full-screen **store lock** built on the pairing pad: its only actions are the pad, which pairs back, and an explanation sheet; every store-keyed call (sale, replay, day report, outbox flush, refunds, floor publish and poll, kitchen sends and voids, cash movements, the print relay, the attendance code) asks `tenantMismatch()` first and sends nothing while it is true, and `sale-unsynced-test` intercepts every request and allows only the pairing call (§10.26, §10.2, M1). The purge that a re-pair runs is cited (`pairing-commit.js:73-86`, `tenant-purge.js:34`); the state is marked memory-only in its lifecycle table; the lock says "Keep this till open and don't reload it" in all three languages; a held copy of the service in `kiwiHeldService:<store>`, outside the purge, is specified as a stage-4 engineering dependency with an owner decision on how long it may stay (§10.26, §9.6, §23, M2). `legacy-faces.css` is linked on every page that names Plex, 48 at `31c94529` (12 of them, `booking.html` and `tickets.html` included, move their Arabic from a system face to Plex, stated as stage 1's one visible change), and `assets/fonts/*.css` joins the stamp tool's CSS-site pass and its served-folder table (§6.1, §6.5, §21.1, §21.3, M3). Check 15 sorts the rows by their §10.26 number and lists every row that applies; the fixture's arrays are corrected and mutations 100 and 101 draw revision 10's order; the stale round 9 fold rule is removed from §24 (§18.0, M4). Every delta is an arrow plus the signed value, stated in §6.3 and §10.21, drawn in every frame and enforced by check 1, with mutations 104 and 105 (M5). `sync.blocked` and `sync.not_synced` are announced once, politely, when they first apply, and a count change is not announced; `banner-announce-test` covers it (§10.26, §14.6, §16, M6).
- **Polish.** All four `persistShift` calls in `recordSale` are cited (P1). The restore citation is corrected, and an unpaired till that restores a blob shows the lock; revision 10's `older-store-entry` case, a state that cannot exist, is replaced by an invariant that every held entry is shown, with mutation 103 (P2). The guard requires a non-empty merchant, and check 15 computes it from each case's stores instead of a `tenant` flag (P3, mutation 109). The lock has an unpaired variant with no empty `{paired}`, and nothing is announced under it (P4, mutation 106). Banners carry Plain actions only, and there is no disabled Charge to explain (P5). `sync.not_synced` has a warning badge, and the rail's one badge has a rule (P6). `access.suspended` says "store" (P7). The format-vectors gate is in `tools/app-archive.sh` and requires an iOS 15.5 simulator runtime (P8). The attendance timer uses the server's `now` (P9). Strings with an interpolated name are never one-line controls (P10). Table placement and dish order are compared by check 17, with mutations 107 and 108 (P11). A banned code point is repaired and reported in production, never blanked (P12).

**Sources read for revision 11:**
- `assets/pairing-commit.js:60-117` (the switch block, `onTenantSwitch` at `:76`, the removals at `:83-84`, `purgeTenantData()` at `:86`), `assets/tenant-purge.js:22-80` (`TENANT_KEYS` at `:34`, `TENANT_PREFIXES` at `:44-45`, `purge()`), `assets/caisse-pairing.js:205-233` (`onTenantSwitch` and the 30/07/2026 note) and `:370-384` (`unpair()`), and `functions/api/pair/create.js:6-15`, `:90` (who may create a pairing code) (M1, M2);
- `kiwi-caisse.html:12322` (kitchen), `:14697-14744` (`recordSale`'s four `persistShift` calls and `postSale` at `:14722`), `:15752`, `:16074`, `:16186-16194`, `:16383`, `:22553-22595` (floor publish and poll), `:22699-22710`, `:23055`, `:23158-23160` (timers); `assets/live-link.js:537`, `:843`, `:910`, `:974`, `:991`; `assets/cash-sessions.js:132`; `assets/printer-bridge.js:725-765`; `assets/caisse-attendance-code.js:46-62` (M1);
- every `*.html` at `31c94529`, with the stylesheets each links (`assets/tokens.css`, `assets/theme.css`, `assets/landing/tokens.css`, `assets/articles/article.css` and its Google `@import`) (M3);
- `tools/app-archive.sh:1-71` (P8) and `functions/api/team/live.js:160-176` (P9).

**How revision 10 was written.** Several round 10 findings came from states and fields added in the two rounds before (the other-store and waiting-store states, `savedLocally`, the tip entry's haptics). So before adding anything, revision 10 wrote each sync state's full lifecycle (set, clear, persist, combine, announce, exit) in one place, §10.26 item 3, checked it against every rule that touches it, and **removed two fields** (`entry.savedLocally`, `saleSyncWaiting`) instead of adding more. The one new field, the entry's `merchant`, is there because the tenant guard needs it.

**What changed since revision 9, by finding:**
- **Majors.** The preview's frames carry `KiwiFormat`'s exact code points (U+00A0 between every number and its unit) and every check compares code points, not folded text; mutations 80 to 82 swap U+00A0 for U+0020 and go red (§18.0, M1). Stage 1 adds `assets/fonts/legacy-faces.css`, the web's only declaration of `IBM Plex Sans Arabic`, before any Google link is removed; the false `tokens.css` citation is corrected and `font-face-census-test` fails on any rendered family with no declaration (§6.1, §6.5, §21.1, M2). Each journal entry records its `merchant`; `postSale` and the replay run only for the paired store and never in the other-store state, where the heartbeat and outbox flush pause and Charge is disabled (§10.26, M3). Banners that appear on their own are announced once, from a live region present at load, `role="alert"` for danger, with `sync.saved_again` on recovery (§10.12, §14.6, §16, M4). The other-store banner names both stores and carries `sync.pair_back`; its exit is pairing back, and it outranks the storage banner while the storage row stays listed (§10.26, M5). Check 15 models the receipt-return path as its own branch, with no outbox input and never `sync.saved_here` (§18.0, M6). The WebKit half of `format-vectors-test` runs in the iOS Simulator through `xcrun simctl`, with no package, and gates the release build; the Chromium half and every shadow-root query use the puppeteer-core already in the repository (§6.3, §2, §20.4, M7).
- **Polish.** §18.0 lists what is still not compared, after checking the venue, zones, categories, the AI weekday, both line ends and the avatar initials in a new check 17 (P1); relative days and signs have stated options, zero is never signed, and the vectors cover them (P2, P3); "paired" is مربوط and "store" is "commerce" in every string, recorded in the glossary (P4); the indicator's badge, colour and visibility are per row (P5); every sync field's set, clear and persist rule is one table (P6); the tip's Done and "Other percentage" fire no haptic (P7); the attendance sheet prints the replacement time, and one time only (P8); the preview names Plex `Kiwi Arabic` (P9).

**Sources read for revision 10:**
- `kiwi-caisse.html:15705-15755` (both service openings set `shiftMerchant`), `:16069-16112` (the replay, with no merchant guard), `:22690-22730` (`persistShift` and the blob's own `merchant`, with its comment on the cross-store report leak), `:22815-22870` (`loadPersistedShift`, `restoreShift` and the journal whitelist at `:22863-22864`), `:23024-23056` (the boot restore's merchant check at `:23055`); `assets/live-link.js:843, 905-912, 1753-1756` (the body's merchant and the `KiwiLive` export) (M3, M5, P6);
- `assets/tokens.css:127, 150-153` and every `*.html` at `31c94529` that links `IBM+Plex+Sans+Arabic` from Google (18 pages) (M2);
- `app/node_modules/puppeteer-core/package.json` (24.43.1), `tools/design-capture/capture.mjs:605-621`, `tools/browser-trace.mjs:1-15`, the two `.github/workflows` files, and `xcrun simctl list` on the owner's Mac (M7);
- Chromium 152's `Intl.RelativeTimeFormat` and `signDisplay` output for the three tags (P2, P3).

**What changed since revision 8, by finding (revision 9):**
- **Majors.** Live Link off is not a refusal: `postSale`'s `undefined` is split into off (no indicator, a neutral More row `sync.off`), no tenant yet (`sync.waiting_store`, healed by the heartbeat) and not applicable, and only `{ok:false}` or a throw counts as not sent (§10.26, M1). A failed autosave is a persistent state: the till keeps the last `persistShift` answer, and while it is not a landed write a `sync.not_saved` (or `sync.not_saved_store`) banner and indicator row stay until one lands, including when the outbox queued and on the merchant-mismatch return; `sale-unsynced-test` names both (§10.26, M2). `KiwiFormat` names `en-GB`, `fr-FR` and `ar-MA-u-nu-latn` and assembles every string from `formatToParts` by part type, with a test-vector table that the preview's check 1 asserts first; the false CLDR sentence is gone (§6.3, M3). The kit owns `--k-font` in `tokens-2027.css`, independent of the legacy `--sans`, `kit-in-host-test` asserts that stack on an AR host, and the two Plex family names are reconciled until stage 7 (§6.1, §6.5, §20.2, M4). Check 14 now derives each line's value at the clock, the now-dot, the step gridlines and the axis labels through the plot scale; the fixture gains a `notifications` source and check 16 holds the bell's badge and the Kiwi AI source chip; the critic's seven green mutations are rows 59 to 67 and go red, with twelve more; §18.0 says exactly what is compared (§18.0, preview, M5).
- **Polish.** R4 has its own copy, `ob.reset.check_failed` (P1); the free table's accessible name interpolates `floor.status.free`, so AR says متاحة (P2); the stale Kitchen badge clause in §18.7 is deleted (P3); §10.22's anatomy is the band-edge gridline plus round steps (P4); the onboarding banners are measured at their real 283 width (P5); the receipt-return path reads the till's autosave state (P6); "Other percentage" is typed in the pane's keypad column, keeping the Received entry (P7); Expected shows once before the first entry, and the opening float's key figure is named (P8); a failed attendance refresh keeps the code until it expires, with `attendance.refresh_failed` (P9).

**Sources read for revision 9** (still in force):
- `assets/live-link.js:41, 64-71, 750-806, 837, 843, 1753-1754` (`realEnv`, `on`, `enqueueMoneyBody`'s answers, `postSale`'s three `undefined` returns, the `KiwiLive` export) and `kiwi-caisse.html:14716-14746, 16083-16093, 16186-16194` (how the till reads `postSale`'s answer, in the sale and in the replay) (M1);
- `kiwi-caisse.html:22692-22713` (`persistShift`'s merchant-mismatch return and its one console line) and `:23159` (the 5 s autosave) (M2, P6);
- the preview browser's `Intl` (Chromium 152) for `en-GB`, `fr-FR`, `ar`, `ar-MA` and `ar-MA-u-nu-latn`: numbers, percent, compact, dates and their `formatToParts` (M3); `assets/tokens.css:153` (M4).

**What changed since revision 7, by finding (revision 8):**
- **Majors.** A sale whose till autosave failed is no longer called saved: `persistShift` reports whether its write landed, `sync.saved_here` shows only when it did, and a failed write shows `sync.screen_only` "Recorded on this screen only. Keep the till open."; check 15 and mutations 55 and 56 hold it (§10.26, §9.6, §18.0, F1). The reset routing follows the shipped server: `update-failed` with `retry: true` keeps the form and the link with `ob.reset.failed` "Your password wasn't changed. Try again."; plain `update-failed` goes to R5 with the one-tap new link; §23.12 is marked shipped; the R5 copy is true for a database fault too (§18.8, §9.6, §23.12, F2). Every date and time a frame draws is derived from the fixture's date and clock, and the rail's cashier, the Orders hour headers, the floor status icons, the VIP stars, the till tiles' badges and option marks, the chart's band and every kitchen ticket's lines are checked against a source; the critic's eight green mutations are rows 42 to 49 and all go red, with nine more (§18.0, preview, F3).
- **Polish.** The chart's top gridline sits on the band edge with the maximum as its label, in all three Home frames, and check 14 holds it (F4); the payment pane has a defined form below 578 (F5); stage 1 names the real font rule, not a token that no longer exists (F6); the §19 size basis is re-measured at `31c94529` (F7); §18.8 counts its Callout banners, with their measured lines (F8); AR `badge.new` shows the "other" form (F9); the free table's accessible name has a key (F10); the attendance sheet maps 503 `not-configured` and 400 `bad-json` (F11); Difference is the largest figure on the cash count, in Display (F12); the payment method rows fire Choose (F13).

**Sources read for revision 8** (still in force):
- `functions/auth/reset.js@a3de3011:117-145` (consume, update, hand-back and the `retry` answer) and `reset.html@a3de3011:322-331` (the page's routing) (F2);
- `kiwi-caisse.html:22692-22793` (`persistShift`: the `setItem` at `:22713` and the swallowed `catch` at `:22792`), `:14692-14746` (the two `persistShift` calls after `journal.push`), `assets/live-link.js:750-800` (`enqueueMoneyBody` returns `queue-storage-full` before IndexedDB is tried) (F1);
- `functions/api/team/live.js:147-149` (503 `not-configured`, 400 `bad-json`) (F11); `app/src/native-runtime.css:1-8` (F6); `assets/i18n.js` and `assets/caisse-lang.js` gzip at `31c94529` (F7).

**Sources read for revision 7** (all at `31c94529`; still in force):
- `kiwi-caisse.html:11380-11406` (the paid moment), `:13690-13729` (`markSplitPartPaid`), `:14530-14753` (`recordSale`: the journal push at `:14692`, `persistShift` at `:14697`, `postSale` at `:14722`, the sync-error branch at `:14734-14739`), `:16069-16112` (`reconcileJournalSales`), `:16194` and `:16383` (its two callers); `assets/live-link.js:244, 280-318, 750-803` (outbox status and `enqueueMoneyBody`) (B1, P10);
- `assets/day-report.js:702-719` (the drawer formula, M1); `functions/auth/reset.js:76-135` (M2); `tools/build-app-www.mjs:38-57, 155-210`, `app/src/native-shell.css:1-7`, `app/src/native-runtime.css:1-5` (M6); `app/src/native-runtime.js:1087-1112` (P3);
- `app/node_modules/@fontsource/` (holds only `ibm-plex-sans-arabic`) and a search of the repository for any Inter file other than Inter Tight: none (M7).

**Sources read for revision 6** (all at `31c94529`; still in force):
- `assets/interactive.js:1697, 4560-4566, 4909-4910`; `kiwi-caisse.html:6412, 10839-10841, 10963-10965, 19045-19049`; `kiwi-serveur.html:4569, 8636, 8758-8766`; `kiwi-cuisine.html:1217, 1977` (dispatchers, §20.4);
- `kiwi-caisse.html:6628, 6710, 6746, 11018-11030, 11104-11116, 11320, 11388, 13200, 13430, 13478-13506, 13541-13545, 13611, 14530, 14584-14596`, `assets/day-report.js:614, 645-646, 719`, `assets/live-link.js` (no `tip` key) (tips, §10.26, §10.30);
- `functions/api/team/live.js:33-54, 146-176`, `functions/api/employee.js:480-500`, `assets/caisse-attendance-code.js:62-67` (attendance code, §10.34);
- `functions/auth/reset.js:60-135`, `functions/auth/_lib.js:1185-1195, 1234-1235` (reset states, §18.8);
- `OrderPro.html:3300, 3807, 3812, 3993, 3998, 4176, 4181`, `kiwi-order.html:2813, 3220, 3225, 3415, 3420, 3610, 3615` (guest copy, §9.6);
- `tools/build-app-www.mjs:40-56, 164`, `tools/stamps.js:21-23` (bundle list, §21.3); `assets/retail-scan.js:197-203` (Web Audio blip, §15.0);
- `assets/icons/material/` (the vendored names, §8); the cmap and GSUB tables of `inter-tight-latin.woff2` and the three Plex Arabic files (§6.1; revision 6 also read an `inter-latin.woff2` that is not in the repository, withdrawn in revision 7).

**Sources read for revision 5** (in addition to revisions 2 to 4; line numbers regenerated at `31c94529`):
- `functions/auth/forgot.js`, `functions/auth/reset.js`, `functions/auth/login.js:8-52`, `reset.html:240-292`, `functions/_middleware.js:416, 707-731` (self-serve reset, commit `816bd764`), `tools/forgot-password-test.mjs`;
- `app/ios/App/App/KiwiNativeShell.swift:145, 334, 803-825, 936`, every `navigator.vibrate` site (§20.3), `app/android/capacitor.settings.gradle:11-12`;
- `assets/liquid-lens.js:74, 150-160, 215`; `tools/build-app-www.mjs:43-56, 160-175`; `kiwi-caisse.html:11390, 17128, 17157, 17319, 18160, 18166`; `assets/live-link.js:763-767`;
- `functions/api/sale.js:80, 170-195` (discount fields and reasons), `kiwi-caisse.html:7058-7061` (the shipped reason chips), `:11385-11405` (`recordSale` and the paid haptic), `:17319-17396` (manager authorisation), `:18045-18176` (the shipped discount);
- `assets/live-link.js:224-250` (`kiwi:money-sync`, the outbox, `kiwi:sale-queue`), `assets/cash-sessions.js:170-185`, `assets/caisse-pairing.js:894-965`, `assets/discount-policy.js:58`;
- `functions/api/config.js:278-317`, `functions/api/_business-day.js:60-76`;
- `functions/auth/signup.js:13-105`, `functions/auth/_lib.js:13, 88-120`;
- `functions/api/pin/verify.js:39-64`, `functions/api/sale/cancel.js:268-285`, `functions/api/employee.js:330-372, 481-511`, `functions/api/team/live.js:150-176`, `functions/api/print/bridges.js:145-170`, `assets/caisse-attendance-code.js:55-80`;
- `functions/api/order/queue.js:107, 729-733, 829, 964-969`;
- `app/src/native-runtime.css` (70 lines naming "Inter Tight": the `@font-face` descriptor at `:1` and 69 use sites), `app/src/native-shell.js:159-163, 263-267`, `tools/build-app-www.mjs:45-56`;
- `app/node_modules/@capacitor/haptics/dist/esm/definitions.d.ts:53-71` (impact styles: Heavy, Medium, Light only);
- `docs/specs/2026-10-12-design-elevation-brief.md:15-40, 225-236` (rubric and haptics map).

---

## 1. What stays, what changes

**Kept, because each earns its place:**
- the Kiwi wordmark, the shipped files, never redrawn: at the leading end of Home's nav bar and at the head of the till's rail (§18.1, §18.3, §18.11; revision 23, P6);
- Atlas green `#0B6E4F`: the light-theme accent, and the colour of the mark on light grounds;
- warm paper `#F7F5F0` as the light canvas;
- the liquid lens: spring `cubic-bezier(0.34, 1.45, 0.5, 1)`, a 115 ms stretch then a 310 ms settle (425 ms in all, §14.3);
- upright type only;
- no em dashes in copy, no emoji in titles or CTAs;
- Material Symbols as the only icon set;
- IBM Plex Sans Arabic for Arabic.

**Changed, one line of reason each:**

| Item | Now | 2027 | Why |
| --- | --- | --- | --- |
| Latin face | Inter Tight variable (app: 44,872 B Latin file, `wght` 100 to 900, measured) | **Inter Tight, kept** (revision 7), self-hosted on the web too, with tracking added at small sizes and measured fallback metrics (§6.1) | Its tight default spacing hurt reading at 13 to 17 px; the tracking table fixes that without a second face. Inter is not in the repository, so a switch would be a download the spec cannot measure against a vendored file. |
| Mono face | JetBrains Mono (40,404 B, measured) | Retired. Codes use the Latin face with `tnum` (no `zero`: neither face has it, §6.1) | Mono prices read as terminal output (ordering finding); this also saves 40 KB. |
| Primary button | `--ink` black (`tokens.css:179`), green on the till, paper white in dark, black on guest Continue | One accent fill per theme | Three primary styles per surface today. |
| Dark canvas | `#000000` (Vexel) | `#0A0D0C` | Leaves room for three elevation steps above it. |
| Accent in dark | Varies by surface | Atlas-lit `#3CCB8F` fill with a `#04140D` label; accent text `#5FD9A3` | `#0B6E4F` on `#0A0D0C` measures 3.12:1 and reads as a hole, not a button. |
| `#0B6E4F` in dark | Used inconsistently | **Never paints in dark.** No dark token resolves to it (§5.2); the mark and accent use atlas-lit | One green per theme. |
| `--riad #053B2C` | Inverse slabs, avatars | Retired from product UI; kept for print and collateral | As a fill it reads as black in dark and as a dark slab in light, the `var(--ink)` problem again. |
| Neon accents | `#00FFAE`, `#14E08A`, `--emerald #3FB67A`, `--success #1FB574` | Retired | As text on light, `#1FB574` is 2.61:1 and `#3FB67A` is 2.53:1. |
| Mint `#7DF2B0` | Fills and text in both themes | Dark theme only: focus ring, live dot, chart now-dot. Never text in light (1.36:1) | Keeps mint under 5 %. |
| Shadows | Green-tinted | Ink-tinted | A green halo is why new kitchen tickets out-shouted late ones (kds B5). |
| Radii | 5 tokens and 13 values in use | 4 tokens plus capsule | Drift, not intent. |
| Curves | spring, glide, expo, plus the feel layer's `cubic-bezier(.2,.8,.2,1)` | spring, glide, exit, plus one gesture spring with computed constants (§14.3) | Four near-identical eases in four spellings. |
| Eyebrows | 12 px uppercase, 0.14em tracking | 13 px sentence case | Uppercase tracking breaks French accents and Arabic, and fails the floor. |
| Selection | Grey-green lens, brand-gradient lens, mint chips, black slabs | One lens: raised fill plus a 1 px edge at ≥ 3:1 | One selection style, CLAUDE.md §4. |
| Lens code | `assets/liquid-lens.js` (light DOM only) | One module, `assets/kit/lens.js`, that serves light-DOM and shadow-DOM tracks; `liquid-lens.js` becomes a 20-line adapter at stage 2 and is deleted at stage 7 (§20.5) | CLAUDE.md §4 says the lens is implemented once. |
| Theme switch | `html[data-theme]` and `body[data-vexel-mode]` | `html[data-theme]`; the kit also honours `data-vexel-mode` until Vexel is retired (§20) | Two systems disagree. |
| Native setup | SF Pro and SF Symbols (`KiwiNativeShell.swift`) | Retired into the web onboarding (§18.8) | The first two screens looked like two products. |
| iOS floor | 15.0 | **15.5 recommended** (owner decision 1, §4, §23) | The kit needs `:focus-visible`, `contain` and `inert`. No device is lost. |

---

## 2. Principles (each with its test)

1. **One glance, at most one primary.**
   - Each view layer (page, sheet or popover) has **at most one** `.k-btn--primary` (including the primary icon variant), for its main task.
   - Per-item actions inside a collection use the item variant `.k-btn--item` (§10.1).
   - Reading screens (Home, Orders, Report, KDS) have no primary.
   - The key figure is the largest text in its layer: no text in that layer has a larger computed size.

   **Test:** in every capture frame, the topmost layer has ≤ 1 visible `.k-btn--primary`. Kit roots are `mode: 'open'`, and the harness queries them with puppeteer-core's deep selectors (`>>>` and `pierce/`, in the `puppeteer-core` 24.43.1 the repository already uses; revision 10, M7: revision 9 said Playwright, which the repository does not have), which pierce open shadow roots; checks that run inside `page.evaluate` use one helper, `deepQueryAll(selector)` in `tools/design-capture/`, that walks every `shadowRoot` (§20.4). The same holds for every selector in §2 and §17. Every `.k-btn--item` is a descendant of `[data-k-collection] > *`. When a layer declares `[data-key-figure]`, no text node in that layer has a larger computed font size (equal is allowed, so a keypad digit at the same step passes). This rule has **no exemptions**; §18 states the result for each hero screen, and Orders was redrawn so that it passes as written (§18.2).
2. **One ledger, named baselines, totals that show their parts.**
   - Every money or count figure renders from `KiwiLedger` on the store's own business day (its cutoff and zone, §17.1).
   - Every comparison prints its baseline.
   - Every total lists the lines that sum to it.

   **Test:** `ledger-agreement-test` (§17) and `components-sum-test` (each `[data-k-total]` equals the sum of its `[data-k-part]` children).
3. **One control per job, in every theme and language.**
   - Tasks use the canonical kit component.
   - Paint comes only from tokens; labels come only from keyed strings that exist in EN, FR and AR.

   **Test:**
   - `kit-lint`: no raw hex or rgba, no px font sizes, no non-kit tablist in adopted surfaces;
   - `i18n-leak-test`;
   - `strings-completeness-test`;
   - `token-contrast-test`.
4. **Built for the hand and the room.**
   - Targets ≥ 44 pt. **Separate** controls are ≥ 8 pt apart. The members of one contiguous control (rows of one list group, segments of one segmented control, items of the tab capsule, keys of one keypad, cells of the date grid) may abut, because the group is one control with a single, predictable rhythm, as in UIKit; each member is still ≥ 44 × 44. ≥ 56 pt on kitchen surfaces; 64 pt for ticket actions.
   - The phone primary sits in the bottom 40 % of the viewport.
   - The kitchen ticket number reads at 2 m on the specified screen (§13.6).

   **Test:** the target audit in `tools/design-capture/` measures every hit rectangle. It checks size for all of them, and the 8 pt distance only between rectangles that belong to different controls: a kit component marks its contiguous members with `data-k-group`, and two rectangles with the same group id are exempt from the distance check, never from the size check. It also checks the y position of the primary on phone frames, and the visual-angle table.
5. **Calm and physical.**
   - Every animation explains a change of place or state, can be interrupted, and has a reduced-motion frame.
   - Each haptic **interaction class** has exactly one feel, and one gesture fires at most one haptic.
   - **One declared exception, the continuous gesture:** a chart scrub is one gesture that plays one Choose bracket with one tick per hour bucket it enters, at most one tick per bucket and per 40 ms (§15.4). No other gesture may fire more than once.

   **Test:** a motion inventory from 60 fps recordings against §14; the haptics trace (`?hapticsTrace=1`) diffed against §15 by `haptics-map-test`, which allows repeated plays within one `gestureId` only with `trigger: 'step'` on the chart scrub (§15.6).

---

## 3. The eight root causes, answered

| # | Root cause | System decision | Artefact | Gate (wired into `check.js`) |
| --- | --- | --- | --- | --- |
| 1 | Numbers from many places | **One reader on each store's business day.**<br>• `KiwiLedger.get(key, range)` resolves `range` with the same rule as the server: `businessDate(ts, cutoff, zone)` (`functions/api/_business-day.js`), where `cutoff` is the store's `merchant_config.business_cutoff` (0 to 12, default 5, `merchantCutoff()` at `:69-76`) and `zone` is `merchantZone()` (default `Africa/Casablanca`). The client receives both from `/api/config` as `businessCutoff` and `timezone`. Today that route sends `null` and `''` when the store has no valid row (`config.js:281-282`, `:313-317`), so the client resolves the same defaults the server does, 5 and `Africa/Casablanca`, in **one** place, `assets/kit/business-day.js` (§17.1). Stage 1 also changes `/api/config` to return the resolved values from `merchantCutoff()` and `merchantZone()`; the client fallback stays for older servers and is tested.<br>• A closed day keeps the cutoff its Z report recorded (`z-reconciliation.js:160-170`).<br>• It returns `{value, precision, asOf, businessDay, cutoff, source}`.<br>• `KiwiLedger.compare(key, baseline)` returns `{delta, baselineValue, baselineLabel}`.<br>• Figures render only through `<k-figure key>`.<br>• One `segmentCustomer()`.<br>• Demo data is seeded with `hash(storeId + businessDay)`. | `assets/kit/ledger.js`, `assets/kit/segment.js`, `assets/kit/demo-seed.js` | `ledger-agreement-test` (§17.1: stores with cutoffs 5, 3 and 0, a store with **no** cutoff row, a cutoff change, the boundary minute, and the Ramadan clock change); `business-day-default-test`; `fixture-agreement-test` (§18.0); `no-random-demo` lint |
| 2 | Translation by matching French after render | **Keyed strings at render**, with ICU plurals, a fallback chain and stamped per-surface bundles (§9). `caisse-lang.js` is frozen and removed per surface as it adopts the kit. | `assets/kit/strings/<surface>.<lang>.js` | `i18n-leak-test`, `strings-completeness-test`, size gate per bundle (§19) |
| 3 | No shared component layer | **One kit** (§10), shadow-DOM custom elements that render the same inside legacy and new pages, under the host contract in §20. | `assets/kit/`, `kit.html` | Kit census lint; gallery baseline; `kit-in-host-test` |
| 4 | Dark and light half built | **One prefixed token set** (`--k-*`) on `:root`, light and dark (§5). The kit follows `html[data-theme]`, and `body[data-vexel-mode]` while Vexel lives. | `assets/kit/tokens-2027.css` | `token-contrast-test`; a dark frame's mean luminance under 0.2 |
| 5 | Phones and tablets compressed | **Declared size classes** (§13): the layout tells each kit host its class; ResizeObserver only for free-floating hosts. Split views on iPad; a drawn phone is banned. | `assets/kit/layout.js` | Lint against fixed app frames; capture overflow detection |
| 6 | Type and targets below the floor | **A six-step rem scale** with a 13 px floor for every text, labels and axes included (§6.2). Text grows inside **min-height** boxes under the shipped Dynamic Type mechanism (§6.4). Zoom is never disabled. | Tokens; geometry rules | `kit-lint` (px font sizes, fixed heights on text containers, with the named exemptions in §6.4); target audit |
| 7 | Destructive and account actions in work surfaces | **Three destructive tiers** (§11) and an IA map (§12). Account actions live only in dashboard Settings › Account. | `assets/kit/ia.json` | `work-surface-actions-test` |
| 8 | Icons outside the system | **Material Symbols only**, through `<k-icon>` from a generated, stamped sprite (§8). | `tools/build-icon-sprite.js` | Lint: no inline `<path` in adopted surfaces outside the sprite |

---

## 4. Platform baseline and the iOS floor

**Verified facts:**
- `IPHONEOS_DEPLOYMENT_TARGET = 15.0` in all four build configurations (`project.pbxproj:259, 310, 328, 351`).
- The web is **embedded** in the app (`app/capacitor.config.ts`: `webDir: 'www'`, built by `tools/build-app-www.mjs`). Kit changes reach iOS only through a new App Store build.

### 4.1 Every WebKit feature the direction touches

Two audiences, two minimums:
- **The app** runs in WKWebView at the recommended floor, iOS 15.5 (§4.2).
- **Guests** (ordering pages, receipts, booking) run in their own browsers. **Guest minimum: Safari 14.1 (iOS 14.5), Chrome and Edge 88, Firefox 78, Samsung Internet 15.** These are the first versions with both `:is()`/`:where()` and flexbox `gap`, which every new page relies on. A boot check (`CSS.supports('selector(:where(a))') && CSS.supports('gap','1px')`) sends an older browser to the **basic page**: the menu as a plain server-rendered list with prices and `ordering.basic` ("This browser can't place orders here. Show this menu to the staff to order."), with no kit and no script beyond the check.

"Since" is the first Safari / iOS version that ships the feature. The last two columns say what happens below that version, in the app and on a guest browser that is at or above the guest minimum.

| Feature | Since (Safari / iOS) | Used for | App, below the 15.5 floor | Guests, between the guest minimum and "since" |
| --- | --- | --- | --- | --- |
| Custom elements, shadow DOM, slots | 10.1 / 10.3 | Core of the kit (§20) | n/a | n/a |
| Pointer events | 13 / 13 | Press, haptics timing, gestures | n/a | n/a |
| ResizeObserver | 13.1 / 13.4 | Free-floating hosts only | n/a | n/a |
| Web Animations (`Element.animate`) | 13.1 / 13.4 | Duration-based motion, the lens (§14.3) | n/a | n/a. If `animate` is missing anyway, the element jumps to its final frame |
| `color-scheme` | 13 / 13 | Native controls inside kit roots follow the theme (§20.2) | n/a | n/a |
| `Intl.PluralRules`, `Intl.NumberFormat` compact | 13, 14.1 / 13, 14.5 | §6.3, §9.2 | n/a | n/a. `KiwiFormat` also catches a `RangeError` from `notation:'compact'` and prints the full number |
| `Intl.RelativeTimeFormat` | 14 / 14 | "2 days ago" (§6.3) | n/a | n/a. If missing, the absolute short date is shown |
| `:is()`, `:where()` | 14 / 14 | New-surface resets | n/a | n/a (the guest minimum) |
| Flexbox `gap` | 14.1 / 14.5 | Layout | n/a | n/a (the guest minimum) |
| `env(safe-area-inset-*)` | 11.1 / 11.2 | Capsule, bill bar, sheets, composer | n/a | n/a; every use carries a `0px` fallback argument |
| CSS scroll snap | 11 / 11 | Scrolling segmented tracks (§10.6) | n/a | n/a |
| `-webkit-backdrop-filter` | 9 / 9 | Materials; written prefixed **and** unprefixed | n/a | Browsers without it get solid surface-1 chrome under `@supports not` |
| `prefers-reduced-motion`, `prefers-contrast` | 10.1, 14.1 / 10.3, 14.5 | §14.5, §16 | n/a | n/a |
| `:focus-visible` | 15.4 / 15.4 | Focus rings (§10.0) | Covered by the floor | A **separate** `:focus` rule, never one selector list, so an old engine drops only the `:focus-visible` rule (§10.0) |
| `contain: layout style` (never `paint` on a control, §10.6) | 15.4 / 15.4 | Lens tracks (§14.4) | Covered by the floor | The lens still works; the cost is a wider reflow |
| `dvh` units | 15.4 / 15.4 | Sheet large detent | Covered by the floor | `height:100vh` is declared before `height:100dvh`, so an older engine keeps `vh` |
| `inert` | 15.5 / 15.5 | Keeping VoiceOver and taps off the page behind a sheet (§10.3) | Covered by the floor | The sheet sets `aria-hidden="true"` on its siblings and traps focus itself |
| `<dialog>` | 15.4 / 15.4 | **Not used.** Sheets are kit elements with `role="dialog"` (§10.3) | n/a | n/a |
| `@layer` | 15.4 / 15.4 | **Not used** (§20.1) | n/a | n/a |
| `:has()` | 15.4 / 15.4 | **Not used** | n/a | n/a |
| `overscroll-behavior` | 16 / 16 | Sheet scroll containment | While a sheet is open the page is locked (`body{position:fixed; top:-scrollY}` restored on close), so a scroll that reaches the sheet's end cannot move the page. On 16+ the sheet body also sets `overscroll-behavior: contain` | Same as the app |
| Container queries | 16 / 16 | **Not used**; size classes are declared instead (§13.1) | n/a | n/a |
| CSS nesting | 16.5 / 16.5 | **Not used**; `kit-lint` fails a nested rule | n/a | n/a |
| `outline` following `border-radius` | 16.4 / 16.4 | **Not relied on.** Focus rings are drawn with `box-shadow` (§10.0) | n/a | n/a |
| `ElementInternals` | 16.4 / 16.4 | **Not used.** Native `<button>`, `<input>` and `<label>` live inside one shadow root (§20.4) | n/a | n/a |
| `adoptedStyleSheets` | 16.4 / 16.4 | Shared kit stylesheet across shadow roots | One `<style>` per shadow root, with the root count bounded by the collection rule (§20.6) | Same as the app |
| `color-mix()` | 16.2 / 16.2 | **Not used** | n/a | n/a |
| `@font-face size-adjust` | 17 / 17 | Fallback metrics (§6.1), Arabic optical match | Unadjusted. Fonts are bundled in the app, so the swap never shows there | Unadjusted; the swap happens at most once per install, because fonts are precached |
| `ascent-override`, `descent-override` | Not in WebKit | Fallback metrics on Chromium and Firefox only | Ignored | Ignored by Safari; applied by Chromium and Firefox |
| `linear()` easing | 17.2 / 17.2 | **Not used**; gesture springs run on a requestAnimationFrame solver (§14.3) | n/a | n/a |
| Event Timing API, `layout-shift` entries | Not in WebKit | Performance evidence | The harness measures on its own (§19) | Same |

### 4.2 Options for the owner (the minimum iOS is the owner's call)

| Option | Gains | Devices that stop receiving app updates |
| --- | --- | --- |
| A · stay at 15.0 | Nothing | None. The kit would ship without focus rings for keyboards on 15.0 to 15.3, without `inert` containment on 15.0 to 15.4, and with wider lens reflow |
| **B · 15.5** | `:focus-visible`, `contain`, `dvh`, `inert`; `@layer`, `<dialog>`, `:has()` available but not used | **None.** Every device that runs iOS 15 can update to 15.8. A device still on 15.0 to 15.4 must update iOS before it can install the new app version; the version it has keeps working |
| C · 16.0 | `overscroll-behavior`, container queries, `color-mix` (16.2) | iPhone 6s, 6s Plus, 7, 7 Plus, SE (1st gen); iPod touch (7th gen); iPad Air 2; iPad mini 4 |
| D · 17.0 | `size-adjust`, `linear()` (17.2) | Also iPhone 8, 8 Plus, X; iPad (5th gen); iPad Pro (1st gen) |

**Recommendation: B, raise the floor to 15.5.** The round 3 ruling is correct: the kit needs 15.4 for `:focus-visible` and `contain`, and 15.5 for `inert`. Option B costs no device; it asks merchants on an old 15.x to update iOS once. Everything above 15.5 in §4.1 has a stated fallback, so C and D are not needed. This **reopens owner decision 1** (§23), which revision 2 answered with A.

Before C is ever considered, the owner should pull the active-device OS mix; no device analytics are known to me today. Guest pages follow the guest minimum and the last column of §4.1, whatever the app floor is.

---

## 5. Colour

### 5.1 Light (`:root`)

| Token | Hex | Role |
| --- | --- | --- |
| `--k-bg` | `#F7F5F0` | Canvas |
| `--k-surface-1` | `#FFFDFA` | Raised: cards, panes, bill, sheet, fields |
| `--k-surface-2` | `#EFECE5` | Inset: tracks, tonal buttons, key caps, rail and sidebar ground |
| `--k-surface-3` | `#E4E0D6` | Pressed, qty boxes, avatars |
| `--k-line` | `#E2DDD2` | Hairline (decorative only) |
| `--k-line-strong` | `#8C877C` | Control boundaries, the selection edge, the KDS header divider |
| `--k-ink-1` | `#0A0F0D` | Primary text and figures |
| `--k-ink-2` | `#454B47` | Secondary text (darkened from `#4B514D` so tertiary reads as a separate level) |
| `--k-ink-3` | `#666B65` | Tertiary, placeholder, disabled label, chart baseline (lightened from `#5F645E`) |
| `--k-accent` | `#0B6E4F` | Primary fill, focus ring |
| `--k-accent-ink` | `#0B6E4F` | Accent as text and icon; **favourable changes** (a delta that is good for the merchant under the KPI's polarity, §10.21; there is no separate "positive" token) |
| `--k-accent-pressed` | `#08573E` | |
| `--k-on-accent` | `#FFFDFA` | |
| `--k-accent-tint` | `#E2EFE8` | The date-range band, info-positive banners |
| `--k-select` | `#FFFDFA` | Lens fill (with edge `--k-line-strong`) |
| `--k-warning` / `-tint` / `-solid` / `--k-on-warning` | `#8A5300` / `#FBEBCB` / `#F0A93E` / `#0A0F0D` | |
| `--k-danger` / `-tint` / `-solid` / `--k-on-danger` | `#B42318` / `#FBE7E4` / `#B42318` / `#FFFDFA` | |
| `--k-info` / `-tint` | `#2558A8` / `#E5EDF8` | |
| `--k-inverse` / `--k-on-inverse` | `#1C2320` / `#F7F5F0` | Toast, tooltip |
| `--k-inverse-accent` | `#5FD9A3` | Toast action and success icon |
| `--k-inverse-danger` | `#FF8A7A` | Toast error icon |
| `--k-focus` | `#0B6E4F` | 2 px ring |
| `--k-scrim` | `rgba(10,15,13,.32)` | Behind sheets |
| `--k-scrim-push` | `rgba(10,15,13,.08)` | Over the outgoing page in a push |
| `--k-chrome` | `rgba(247,245,240,.85)` with blur 24 px, saturate 180 % | §7.5 |

### 5.2 Dark (`:root[data-theme="dark"]`, `body[data-vexel-mode="dark"]`)

The dark set also applies under `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`. No dark token resolves to `#0B6E4F`.

| Token | Hex | Role |
| --- | --- | --- |
| `--k-bg` | `#0A0D0C` | |
| `--k-surface-1` | `#141917` | |
| `--k-surface-2` | `#1C2220` | |
| `--k-surface-3` | `#262D2A` | |
| `--k-line` | `#29302D` | |
| `--k-line-strong` | `#6B746F` | |
| `--k-ink-1` / `-2` / `-3` | `#F2F0EA` / `#B3B9B4` / `#848B85` | ink-3 darkened from `#8E958F` |
| `--k-accent` | `#3CCB8F` | Fill |
| `--k-accent-ink` | `#5FD9A3` | Text, icons, favourable changes, chart series 1 |
| `--k-accent-pressed` | `#2FB27C` | |
| `--k-on-accent` | `#04140D` | |
| `--k-accent-tint` | `#123528` | |
| `--k-select` | `#262D2A` | Lens fill (with edge `--k-line-strong`) |
| `--k-warning` / `-tint` / `-solid` / `--k-on-warning` | `#F2B85B` / `#3A2C12` / `#F0A93E` / `#0A0F0D` | |
| `--k-danger` / `-tint` / `-solid` / `--k-on-danger` | `#FF8A7A` / `#3D1A16` / `#C8372D` / `#FFFDFA` | |
| `--k-info` / `-tint` | `#8AB4F8` / `#172436` | |
| `--k-inverse` / `--k-on-inverse` | `#323A36` / `#F2F0EA` | Toast and tooltip are a raised dark capsule with a 1 px `--k-line-strong` edge, not a light slab |
| `--k-inverse-accent` / `--k-inverse-danger` | `#5FD9A3` / `#FF8A7A` | Replaces revision 2's `#0B6E4F` / `#B42318` |
| `--k-focus` | `#7DF2B0` | |
| `--k-scrim` / `--k-scrim-push` | `rgba(0,0,0,.56)` / `rgba(0,0,0,.30)` | |
| `--k-chrome` | `rgba(20,25,23,.85)` with blur 24 px, saturate 180 % | |

### 5.3 Contrast (WCAG 2.x, recomputed for revision 3)

**Method.** Relative luminance per WCAG 2.x from sRGB hex; ratios rounded to 2 decimals. Translucent chrome is composited in sRGB space (as browsers composite) before measuring: **typical** is chrome over its own canvas; **worst case** is chrome over pure black content (light) or pure white content (dark). The script is in the round evidence pack.

**Text on surfaces**

| Text | Light: bg / s1 / s2 / s3 | Dark: bg / s1 / s2 / s3 |
| --- | --- | --- |
| ink-1 | 17.73 / 19.03 / 16.37 / 14.66 | 17.13 / 15.60 / 14.19 / 12.36 |
| ink-2 | 8.20 / 8.80 / 7.57 / 6.78 | 9.77 / 8.90 / 8.09 / 7.05 |
| ink-3 | 5.00 / 5.36 / 4.62 / 4.13 | 5.59 / 5.09 / 4.63 / 4.03 |
| accent-ink | 5.74 / 6.16 / 5.30 / 4.75 | 11.10 / 10.11 / 9.19 / 8.01 |
| warning | 5.81 / 6.23 / 5.36 / 4.80 | 10.95 / 9.98 / 9.07 / 7.90 |
| danger | 6.03 / 6.47 / 5.57 / 4.99 | 8.52 / 7.76 / 7.06 / 6.15 |
| info | 6.34 / 6.80 / 5.86 / 5.24 | 9.26 / 8.44 / 7.67 / 6.68 |

ink-2 to ink-3 now differ by 1.64:1 in light (8.20 against 5.00 on bg) and 1.75:1 in dark (9.77 against 5.59), against revision 2's 1.34. ink-3 text never sits on s3 except as a disabled label, which WCAG 1.4.3 exempts (4.13 light, 4.03 dark).

**Fills and the labels on them**

| Pair | Light | Dark |
| --- | --- | --- |
| on-accent on accent | 6.16 | 9.12 |
| on-accent on accent-pressed | 8.47 | 7.00 |
| on-danger on danger-solid | 6.47 | 5.12 |
| on-warning on warning-solid | 9.61 | 9.61 |
| on-inverse on inverse | 14.71 | 10.27 |
| inverse-accent on inverse | 9.11 | 6.66 |
| inverse-danger on inverse | 7.00 | 5.11 |
| ink-1 / ink-2 on accent-tint | 16.32 / 7.55 | 11.77 / 6.72 |
| accent-ink on accent-tint | 5.29 | 7.63 |
| ink-1 / ink-2 on warning-tint | 16.42 / 7.59 | 11.90 / 6.79 |
| warning on warning-tint | 5.38 | 7.61 |
| danger on danger-tint | 5.53 | 6.75 |
| info on info-tint | 5.86 | 7.42 |
| ink-1 on select (lens) | 19.03 | 12.36 |
| accent-ink on select (selected tab icon) | 6.16 | 8.01 |
| ink-2 on the s2 track (unselected labels) | 7.57 | 8.09 |
| Disabled: ink-3 on s3 (exempt) | 4.13 | 4.03 |
| Placeholder: ink-3 on s1 field | 5.36 | 5.09 |

**Non-text (3:1 needed where it identifies a control or state)**

| Pair | Light | Dark |
| --- | --- | --- |
| Selection edge (line-strong) vs s2 track | 3.03 | 3.35 |
| Selection edge vs s1 list | 3.52 | 3.69 |
| Selection edge vs bg | 3.28 | 4.05 |
| Selection edge vs chrome, typical (chrome over its own canvas) | 3.28 | 3.75 |
| Selection edge vs chrome, worst case | 2.33 | 2.34 |
| Field outline (line-strong) vs bg | 3.28 | 4.05 |
| Primary fill vs bg | 5.74 | 9.42 |
| Focus ring vs bg / s1 | 5.74 / 6.16 | 14.13 / 12.87 |
| Selected-row bar (accent) vs s1 | 6.16 | **8.58** (revision 2 wrongly listed accent-ink's 10.11) |
| KDS late frame (danger-solid) vs s1 | 6.47 | 3.42 |
| KDS header divider (line-strong) vs s1 | 3.52 | 3.69 |
| Date-range band edges (line-strong) vs s1 (§10.19) | 3.52 | 3.69 |

**Text on chrome:**

| Text | Light typical | Light worst | Dark typical | Dark worst |
| --- | --- | --- | --- | --- |
| ink-1 | 17.73 | 12.56 | 15.86 | 9.90 |
| ink-2 | 8.20 | 5.81 | 9.05 | 5.65 |
| Accent (light: icon only) | 5.74 | 4.07 | n/a | n/a |
| accent-ink | n/a | n/a | 10.28 | 6.42 |
| Accent fill | n/a | n/a | 8.72 | 5.45 |

Typical light chrome equals the canvas, so its values equal the bg column (revision 2 listed 17.90, 7.53 and 5.79, which was wrong). **Rule:** labels on chrome are ink-1 or ink-2; accent on light chrome is icons only.

The worst-case chrome edge falls below 3:1 (2.33 / 2.34). In the tab capsule the selected state is therefore also carried by a **shape** (the lens's filled pill behind the item), a **weight** change of the label (500 to 600) and a colour change (icon ink-2 to accent-ink, label ink-2 to ink-1), so the edge is never the only cue. Revision 6 used a filled icon as the shape cue; its `fill1` files are not vendored, and the preview drew the selected icon outlined, so revision 7 drops it rather than depend on a file the repo lacks.

**Exempt, stated:**
- the hairline `--k-line`, which is decorative: light 1.33 against s1 and 1.24 against bg; dark 1.32 against s1 and 1.45 against bg;
- warning-solid as a light KDS header fill, 1.98 against s1. That header always carries a distinct icon and its text at 9.61:1, so the fill is never the only cue;
- the dark toast boundary (inverse vs bg 1.67): a toast is text, not a control, and its text is 10.27:1.

### 5.4 Usage rules
- Chart: series 1 is accent (accent-ink in dark); the baseline is ink-3 dashed 4/4 at 1.5 px (5.36 / 5.09 against s1); series 2 is info. At most 3 series on phone.
- No channel colours. A delivery channel is an icon plus its name.
- No status is shown by hue alone: there is always an icon, a word or a shape change.

---

## 6. Type

### 6.1 Faces and measured weights
- **Latin and digits: Inter Tight variable**, roman, Latin subset, self-hosted, **`wght` 400 to 700** used (700 for Bold Text only, §16). A Latin Extended file loads only through `unicode-range`.
  - The file is the one the app already ships: `inter-tight-latin-wght-normal.woff2`, **44,872 B**, axis `wght` 100 to 900 (`app/node_modules/@fontsource-variable/inter-tight/`, `index.css: font-weight: 100 900`), so 700 exists and no faux bold is drawn. Stage 1 copies it into `assets/fonts/inter-tight-latin.woff2` with its OFL licence file from the same package; nothing is downloaded.
  - **Revision 7 withdraws revision 6's switch to Inter.** Revision 6 measured an Inter file that is not in the repository, `app/node_modules` or the app bundle (searched at `31c94529`: the only fontsource packages are `@fontsource-variable/inter-tight`, `@fontsource-variable/jetbrains-mono` and `@fontsource/ibm-plex-sans-arabic`), so its widths could not be drawn by the preview and the shipped face would have been one nobody had rendered the frames in. Keeping Inter Tight removes that gap: **every width in §6.4, §6.6 and §18 is measured in this file**, the preview draws its frames in the same file and checks at load that it did (a reference label must measure its §6.6 width, or the kit self-test fails), and `label-fit-test` logs the face and the reference width it measured on every run. §23.5 records the choice.
  - **What the file does not contain (checked with fontTools on the cmap and the GSUB feature list):** U+202F (narrow no-break space) and the `zero` (slashed zero) feature. It has U+00A0, U+2212 and `tnum`. §6.3 is written to that coverage, so no character the kit emits falls back to a system font inside a measured width. **U+202F is banned, not added (revision 15, M3, P7):** no fontsource subset of Inter Tight has it (latin, latin-ext, cyrillic, greek and vietnamese were all read), so adding it would mean building a new subset from a source file the repository does not have; `KiwiFormat` never emits it and `strings-lint` fails it (§9.6), and French high punctuation uses U+00A0, which the file has.
- **Tracking** is added at small sizes to undo the tight default (the values are the §6.2 column): Display −0.02em, Title −0.01em, Heading 0, Body +0.01em, Callout +0.01em, Footnote +0.015em.
- **Fallback face** `"Inter Tight Fallback"`: `src: local("Arial")`, `size-adjust: 97.0%`, `ascent-override: 99.9%`, `descent-override: 24.9%`, `line-gap-override: 0%`. Measured from the bundled woff2's `hhea` and `hmtx` tables against `/System/Library/Fonts/Supplemental/Arial.ttf`: average advance 0.4746 em against 0.4895 em over a sample of a pangram, digits and French words. `size-adjust` applies on iOS 17+; the overrides apply in Chromium and Firefox and are ignored by WebKit (§4.1). `tools/font-metrics.mjs` (zero dependencies, Node's built-in Brotli) re-derives these at stage 1. **Its `unicode-range` is the union of Inter Tight's two file ranges** (revision 14, B1), so it stands in for Inter Tight and for nothing else. The ranges are copied from `@fontsource-variable/inter-tight/index.css` (the face itself is in the declarations below):
  - Latin, `:68`: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  - Latin Extended, `:58`: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF.
- **Android has no Arial, and the shift there is accepted (revision 15, P10).** On Android `local("Arial")` matches nothing, so the fallback face is skipped and, until Inter Tight arrives, Latin text is set in the system face (Roboto on most devices, a vendor face on some) with no metric overrides. No Roboto source is added now, for three reasons:
  - **The metrics cannot be derived here.** The overrides are computed from the real file (`tools/font-metrics.mjs`), and this machine has no Roboto Regular: the only Roboto files on it are Roboto Light and Roboto Thin inside an Android tool's bundled Java runtime, whose advances are not Regular's. Nothing is downloaded (the project's rule), and a guessed override is worse than none, because it would be wrong in a way no test sees.
  - **The face is not one face.** `local()` matches a font by its full or PostScript name, and Android vendors ship different system faces under different names, so one `local("Roboto")` source with one set of overrides would fit some devices and miss others.
  - **The shift is a first-visit event.** The Latin file is preloaded (§6.5), and on the pages with a service worker it is precached, so there the swap happens at most once per device, on the first visit, before the file arrives. Guest ordering, which Android phones open most, is where it shows, and §19's budget of 0.01 per load applies there as everywhere.

  **What closes it.** The guest-ordering stage (§21.1, stage 3c) records the first-visit layout shift on the Android emulator, from a cold cache, on a throttled 4G profile. If it exceeds 0.01, that stage adds a second face, `"Inter Tight Fallback Android"`, `src: local("Roboto")`, with overrides derived by `tools/font-metrics.mjs` from the emulator image's own Roboto file, and the same `unicode-range`, after `"Inter Tight Fallback"` in the stack. On a device without Arial the first fallback face is skipped and the second applies; on Apple and Windows the first applies, as today.
- **Arabic:** IBM Plex Sans Arabic 400, 500 and 600, Arabic subset only, family `Kiwi Arabic`, through `unicode-range` U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF and U+FE70-FEFF.
  - Measured sizes: 42,848 / 45,296 / 45,688 B.
  - **700** (44,280 B, measured) is declared too, but only fetched when Bold Text is on **and** Arabic glyphs render; `unicode-range` plus the weight match means no other device downloads it.
  - These download only when Arabic glyphs render.
  - `size-adjust: 108%` (effective on iOS 17+, unadjusted below).
- **Stack:** `"Inter Tight", "Kiwi Arabic", "Inter Tight Fallback", system-ui` (revision 14, B1: revision 13 put the fallback face second, with no range). Digits, Latin brand names and "MAD" come from Inter Tight. In Arabic the unit is درهم, set in Plex.
- **The declarations, exactly (revision 15, P13).** `assets/kit/tokens-2027.css` holds these rules and no other `@font-face`. The preview declares the same faces with the same descriptors, in the same order; only each `url()` differs, in its folder **and its file names** (revision 16, P7: the preview keeps the package's names, such as `ibm-plex-sans-arabic-400.woff2` for `plex-arabic-400.woff2`), and its kit self-tests, which run when it loads, compare the two descriptor by descriptor, and each file's size with the size below, and fail on any difference. Latin Extended is declared before Latin, as in fontsource's `index.css` (revision 16, P5). Stage 1 copies `inter-tight-latin-ext-wght-normal.woff2` (89,800 B) beside the Latin file as `inter-tight-latin-ext.woff2`, with the same licence, and the four Plex files as `plex-arabic-400.woff2` to `plex-arabic-700.woff2`.

  ```css
  @font-face { font-family: "Inter Tight"; src: url("../fonts/inter-tight-latin-ext.woff2?v=N") format("woff2"); font-weight: 100 900; font-style: normal; font-display: swap;
    unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
  @font-face { font-family: "Inter Tight"; src: url("../fonts/inter-tight-latin.woff2?v=N") format("woff2"); font-weight: 100 900; font-style: normal; font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
  @font-face { font-family: "Kiwi Arabic"; src: url("../fonts/plex-arabic-400.woff2?v=N") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; size-adjust: 108%;
    unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF; }
  /* 500, 600 and 700: the same rule, with plex-arabic-500, -600 and -700 and that font-weight */
  @font-face { font-family: "Inter Tight Fallback"; src: local("Arial"); size-adjust: 97%; ascent-override: 99.9%; descent-override: 24.9%; line-gap-override: 0%;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD, U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
  :root { --k-font: "Inter Tight", "Kiwi Arabic", "Inter Tight Fallback", system-ui; }
  ```
- **Per-character fallback, and why revision 13's stack set Arabic in Arial (revision 14, B1).**
  - **The rule.** A browser picks a face for each character, not for the string. It takes the first family in the list that has a face whose `unicode-range` includes the character and whose file has a glyph for it. A `local()` face has every glyph of the platform font, and with no `unicode-range` it claims all of Unicode.
  - **Arial has Arabic.** Arial has 235 code points in U+0600-06FF on macOS (`/System/Library/Fonts/Supplemental/Arial.ttf`; 524 across the five ranges Kiwi Arabic declares, counted with fontTools). The iOS simulator's WebFonts Arial has the same 235 (round 14 critique).
  - **So revision 13's stack failed.** In `"Inter Tight", "Inter Tight Fallback", "Kiwi Arabic", system-ui`, every Arabic letter stopped at Arial. "مقعدان" at 400 17 px measures 34.98 there, against 51.69 in Plex (Chromium 152).
  - **The fix has two parts, and each alone is enough.** Measured: once the fallback face has its range, both orders of the stack give 51.69. The range keeps the fallback face to the characters it stands in for. The order puts Plex before any face that could claim Arabic, so a later fallback cannot repeat the bug.
  - **While Plex is still loading,** an Arabic letter goes past the ranged fallback face to `system-ui` (SF Arabic on Apple), never to Arial.
- **Every stack, audited by that rule (revision 14, B1).** For each stack, the question is whether a face listed before the one meant for a script can claim that script's characters. The coverage below was read from the files with fontTools:
  - the Inter Tight Latin file has 231 code points (Latin, digits and punctuation); in the Arabic blocks it has only U+FEFF, a zero-width no-break space and not a letter;
  - the Plex Arabic files have 676 code points in the Arabic ranges, plus U+0000, U+000D, U+0020, U+00A0 and U+2010, and no digit.

  | Stack | Where | Can an earlier face take a later script? | What follows |
  | --- | --- | --- | --- |
  | Kit `--k-font` | `tokens-2027.css`, every language | In revision 13, yes: the Arial fallback with no range took Arabic. In revision 14, no: Inter Tight's file has no Arabic letter, Kiwi Arabic's range has no Latin, and the fallback face's range has no Arabic | Fixed here, and gated by `kit-in-host-test`, `label-fit-test` and `font-coverage-test` |
  | Legacy `--sans`, EN pages | `tokens.css@31c94529:125`: `"Inter Tight", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` | There is no Arabic family at all. The system sets Arabic on a legacy EN page (a customer's Arabic name, for example): SF Arabic through `-apple-system` on Apple, and Segoe UI, which has Arabic, on Windows | Shipped and unchanged. A kit surface names Kiwi Arabic in every language, so the gap closes surface by surface as stages 3 to 6 adopt the kit |
  | Legacy `--sans`, AR pages | `:153`: `"IBM Plex Sans Arabic", "Inter Tight", "Cairo", sans-serif` | Yes, by design today. Google's Plex CSS also declares Latin and Latin Extended faces; Fontsource's copy has the same subsets: `arabic`, `latin`, `latin-ext` and `cyrillic-ext`. So Plex sets the Latin text and digits of a legacy Arabic page | Stated above under stages 3 to 6. When a page's Google source goes, `legacy-faces.css` covers Arabic only, and those characters fall to Inter Tight; that stage's capture diff is reviewed. The kit never reads `--sans` |
  | Legacy `--mono` | `:130`: `Arial, Helvetica, sans-serif` | Yes. Arial comes first, so Arabic inside a legacy `.mono` element is set in Arial today, on every page | Shipped. The kit has no mono stack: codes use `--k-font` with `tnum` (§6.1's table of retired faces), and stage 7 deletes `--mono` with the legacy tokens |
  | Legacy `--arabic` | `:127`: `"IBM Plex Sans Arabic", "Cairo", sans-serif` | No | Nothing |
  | App shell, EN (revision 15, P11: revision 14 quoted these stacks short) | `native-shell.css:13`: `--sans: "Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif`; `native-runtime.css:7`: `"Inter Tight",sans-serif` | No. Family by family: Inter Tight's face has no range (`:4`) but its file holds no Arabic letter, so it takes Latin and digits only; `-apple-system` and `BlinkMacSystemFont` are the Apple system face, which sets Arabic in SF Arabic; `"Segoe UI"` is Windows' face, which has Arabic; `Roboto` has no Arabic, and Android sets Arabic in its own fallback (Noto); `system-ui` and `sans-serif` are reached last. So Arabic on an English app page is set by the platform, as on a legacy EN web page, and nothing before Inter Tight can take Latin | Shipped and unchanged; kit surfaces use `--k-font` |
  | App shell, AR | `native-shell.css:29`: `--sans: "IBM Plex Sans Arabic", "Inter Tight", sans-serif`; `native-runtime.css:8`: `"IBM Plex Sans Arabic","Inter Tight",sans-serif` | The Plex faces there have no `unicode-range` (`native-shell.css:5-7`, `native-runtime.css:2-4`). Their files hold only Arabic plus the space, the no-break space and U+2010, so on an Arabic app page those three characters come from Plex, and every digit and Latin letter comes from Inter Tight | Stage 1 repoints these rules without changing their names or ranges, so its zero pixel diff holds. Adding a range there would move the spaces to Inter Tight, a change no stage needs. JetBrains Mono (`native-runtime.css:5`) is a Latin file, no kit stack names it, and stage 7 retires it |
  | `system-ui`, last everywhere | All | It is reached only by a character that no earlier face claims | Nothing |
  | The preview | `kiwi-design-2027-preview.html` | Revision 13 drew its Arabic frames in `"Kiwi Arabic", "Inter Tight"` and never declared the fallback face, so it could not show the blocker | Every frame and chart label uses the shipped stack, and since revision 15 (P13) the page declares the faces exactly as the block above, Inter Tight's two ranges included; its kit self-test fails on any descriptor that differs. No frame character reaches the fallback face (checked against both files' cmaps) |

- **The kit owns this stack (revision 9, M4).** `assets/kit/tokens-2027.css` sets `--k-font: "Inter Tight", "Kiwi Arabic", "Inter Tight Fallback", system-ui` on `:root` (in this order since revision 14, B1), in every language, and nothing in the kit reads the legacy `--sans`. The legacy variable stays as it ships: on Arabic pages `tokens.css@31c94529:153` sets `--sans: "IBM Plex Sans Arabic", "Inter Tight", …`, Plex first, unadjusted, with no `unicode-range`, which would set Arabic-page digits in Plex at 100 % and break every AR width in §6.6 (the guest chips fit with 1.4 px to spare, 310.6 of 312). Inheriting it is therefore not allowed.
- **Two family names over the same Plex files, until stage 7 (revision 10, M2: revision 9 cited a declaration that does not exist).** The kit declares the Plex files as `Kiwi Arabic` (Arabic ranges only, `size-adjust: 108%`) in `tokens-2027.css`. The legacy name `IBM Plex Sans Arabic` is what legacy rules use (`tokens.css:127` in `--arabic`, `:153` in the Arabic `--sans`, `native-runtime.css:7-8`), and **where it is declared differs by platform**:
  - **App:** `app/src/native-runtime.css:2-4` and `app/src/native-shell.css` declare it, from `native-fonts/` today and from `assets/fonts/` after stage 1 (§6.5).
  - **Web: no Kiwi stylesheet declares it.** `tokens.css@31c94529` has no `@font-face` at all; on the web the family comes only from Google Fonts, by three routes that the census below counts (revision 12, M5), and `kiwi-caisse.html` loads no Plex at all. So a page that dropped its Google link while legacy drawers still name the family would set their Arabic in a system face.
  - **So stage 1 adds the legacy declaration first.** A new stylesheet, `assets/fonts/legacy-faces.css`, declares `IBM Plex Sans Arabic` 400, 500 and 600 from the same `assets/fonts/` files, with the Arabic `unicode-range` (the files hold Arabic only) and no `size-adjust`, as today. Stage 1 links it, stamped, on **every page that names the family** and has no Kiwi declaration of it. Which pages those are is **not counted by hand** (revision 12, M5: revisions 10 and 11 each published a hand count, 18 and then 48, and each was short):
    - **The census is a committed script, `tools/plex-census.mjs`** (stage 1, Node built-ins only). It walks every `*.html` that `git ls-files` lists (skipping `node_modules/` and the iCloud conflict copies `* 2.*`, CLAUDE.md §1), reads each page's markup and every local stylesheet it links (a leading `/` resolved against the repository root, a relative path against the page's folder), follows local `@import` up to three deep, and classifies the page by **how it gets Plex**: (1) a Google Fonts URL naming `IBM+Plex+Sans+Arabic` in its own markup; (2) such a URL in an `@import` of a stylesheet it links, reported with that stylesheet's path; (3) an `@font-face` for the family in a Kiwi stylesheet; (4) none of these, while the page or a stylesheet it loads names the family. It prints one line per page and a total per class, and exits non-zero on a page it cannot classify. **It also reports, per page, the Plex weights requested** (revision 13, M5): the `wght@` list of the Google URL, or the `font-weight` of each Kiwi `@font-face`.
    - **Its output at `31c94529`, 52 pages** (as computed by the same method for this revision; the round 12 critic's own script found the same 52):

      | How the page gets Plex | Pages | Which | Plex weights requested |
      | --- | --- | --- | --- |
      | (1) Google link in its markup | 18 | `Kiwi-Brand-Identity.html`, `OrderPro.html`, `brand.html`, `business-plan-v2.html`, `cafe-atlas-qr.html`, `cookies.html`, `dashboard.html`, `docs/templates/landing-og-es.html`, `kiwi-cuisine.html`, `kiwi-order.html`, `kiwi-serveur.html`, `mentions-legales.html`, `pitch.html`, `privacy.html`, `status.html`, `support.html`, `terms.html`, `wallet.html` | 400, 500, 600 on 14; **400 to 700** on 4 (`OrderPro.html`, `cafe-atlas-qr.html`, `kiwi-cuisine.html`, `kiwi-order.html`) |
      | (2) `@import` in `assets/articles/article.css` | 18 | the 17 guide pages and `docs/templates/article.html` | **300**, 400, 500, 600 |
      | (2) `@import` in the Next chunk `_next/static/chunks/1d07ha593kf43.css` | 11 | the 8 landing pages (`index.html`, `ar/`, `de/`, `en/`, `es/`, `fr/`, `it/`, `nl/`) and `ar/robot/`, `en/robot/`, `fr/robot/index.html` | **200, 300**, 400, 500, 600 |
      | (3) Kiwi `@font-face` | 1 | `app/src/index.html`, through `app/src/native-shell.css` | 400, 500, 600 (declared) |
      | (4) none | 4 | `kiwi-caisse.html`, `booking.html`, `tickets.html`, `tools/retail-scan-browser-fixture.html` | none requested (the family is named through `tokens.css`) |

      **Weights, declared or mapped (revision 13, M5).** `legacy-faces.css` declares 400, 500 and 600, the Arabic weights the app ships today (§6.1). Three requested weights are not declared, and what happens to each is stated rather than left to chance:
      - **While a page keeps its Google source, nothing changes for them:** Google's 200, 300 and 700 faces are still declared and still serve those weights.
      - **When a page's Google source is removed** (stages 3 to 6, and for the Next chunk the landing's own stage), CSS font matching takes over: a requested **200 or 300 renders with the 400 face** (below 400 the browser looks lighter first, finds none, then takes the nearest heavier), and a requested **700 renders with the 600 face** (above 500 it looks heavier first, finds none, then takes the nearest lighter); the 600 face is already a bold-class weight, so no synthetic bold is drawn. That is a visible change on the 18 `article.css` pages (300), on the 11 Next-chunk pages (200 and 300; `ar/index.html` sets Arabic in `font-extralight` 83 times and `font-light` 3 times, by the round 13 critique's count) and on the 4 pages that request 700 (`kiwi-cuisine.html` uses it 12 times), and each of those stages' AR capture diffs is reviewed for it. The direction accepts it, because 400 to 600 is the whole of the Arabic range the app already ships; a surface that needs a lighter Arabic face asks for a face file, not a mapping.
      - **The census test checks the mapping, not just the presence:** for each page and each requested weight, it fails unless the weight is declared by a Kiwi stylesheet, still served by the page's Google source, or listed in this mapping.

      `kiwi-admin.html` names the family nowhere and is not in the set. The table is this revision's reading of the script's output, not the rule: the rule is the script, and the test below runs it.
    - **Where the link goes, per class.**
      - **(1) and (2) through `article.css`, 36 pages:** before the Google link or before `article.css`. While both exist the Google rules come later and win for the same family and descriptors, so nothing changes on screen and the local files are never fetched (a face is downloaded only when used).
      - **(2) through the Next chunk, 11 pages: after the chunk, so the self-hosted face wins over the `@import`.** These pages are a committed Next export with no source in the repository (they are edited by hand, for example `2db68c88`), so there is nothing to rebuild; and the chunk sits under `/_next/static/`, which `_headers:34-35` serves `immutable` for a year, so editing it in place would leave every returning browser on the old file. A plain `<link rel="stylesheet">` with no `data-precedence`, placed after the chunk's `<link … data-precedence="next">`, is a later `@font-face` for the same family, weights and Arabic `unicode-range`, so it wins for Arabic text, and React's stylesheet handling, which manages only `precedence` links, leaves it where it is. **This is a visible change at stage 1, stated, and smaller than revision 12 said** (revision 13, M5): Arabic text **at 400, 500 and 600** moves from Google's build of Plex to the self-hosted build of the same family (hinting and subsetting can differ); Arabic at 200 and 300, which `ar/` uses most, stays on Google's faces until the `@import` goes, because the self-hosted set has no such weights; and **Latin text and digits that these pages set in Plex** (`html[lang=ar] body` names `IBM Plex Sans Arabic` first) stay on Google's Latin faces, because `legacy-faces.css` covers the Arabic ranges only. So on `ar/` and `ar/robot/` weight 400 of the family is served from two URLs, `assets/fonts/` for the Arabic range and `fonts.gstatic.com` for the Latin range, which is correct and is why the census rule below is scoped by range. Their AR capture diff is reviewed. The `@import` itself, which also brings Inter Tight, is removed when the landing adopts the kit: the chunk is copied to a new file name without its first line and the 11 links move to it in one commit, never by editing the hashed file.
      - **(3), 1 page:** nothing; the app shell declares the family itself.
      - **(4), 4 pages:** anywhere in the head. Today no face answers the name there, so their Arabic is set in a **system Arabic face**. **This is also a visible change at stage 1:** their Arabic text is set in Plex, the face the brand names for Arabic, while their Latin text and digits do not move, because the declaration covers the Arabic ranges only. So `booking.html` (a guest page) and `tickets.html` get Plex for their Arabic at stage 1, as does the caisse, which no longer waits for stage 4; their AR capture diff is reviewed (the shapes change; the line count is checked against §6.6's AR widths, which are measured in Plex). Revision 11 also put the 8 landing pages here, which was wrong: they already get Google Plex through the Next chunk.
    - **Then stages 3 to 6.** Each of those stages removes a surface's Google link, and the legacy rule then serves that surface's legacy Arabic text. What changes there is stated, not hidden: legacy Arabic-page digits, which Google's Latin subset of Plex set today, fall to the next family in the legacy `--sans`, Inter Tight, and that stage's capture diff is reviewed for it.
  - **It is stamped like every other stylesheet (revision 11, M3).** `legacy-faces.css` lives in `assets/fonts/`, and §21.3's CSS-site pass reads `assets/fonts/*.css`, served where it sits: its `url()` references resolve against `assets/fonts/`, so `url("plex-arabic-400.woff2?v=N")` there and `../fonts/plex-arabic-400.woff2?v=N` in `assets/kit/tokens-2027.css` are one key with one stamp, and `stamp-drift-test` sees both.
  - Both names point at **the same URL per weight**, so a page that uses both downloads each file once. Stage 7 deletes `legacy-faces.css`, the native legacy declarations and the legacy `--sans` together, and from then on `Kiwi Arabic` is the only name.
  - **`font-face-census-test`** loads every web page and the app shell and fails when: a family that renders text on the page has neither an `@font-face` rule nor a Google link (the case revision 9 missed); one character, at one weight of one family, **is requested from two URLs** (revision 13, M5; revision 16, P5; revision 17, P5: observed, not inferred from the declarations). The test renders each character the page can show, alone and at each weight the page uses, in a fresh frame, and reads the font requests that rendering caused on the network. Revision 16 asked whether a character can be served by two URLs, which stage 1's deliberate overlap fails. A declared overlap in which the later face wins causes one request, so it passes, and two such overlaps are **named here so that nobody removes them as errors**: stage 1's Plex Arabic at 400 to 600, declared from Google and from `legacy-faces.css` on the 47 pages of classes (1) and (2) until stage 7 (on the 36 `article.css` pages Google's rules come later and win; on the 11 Next-chunk pages `legacy-faces.css` comes later and wins, above); and the kit's two Inter Tight files, fontsource's Latin and Latin Extended subsets of one package, which share U+0304, U+0308, U+0329 and U+2020 by the package's design (`index.css:58`, `:68`), where §6.1 declares Latin Extended first and Latin second, as fontsource does, so the browser requests the later Latin face only. One URL for the Arabic range and another for the Latin range is not an overlap at all; a page that has dropped its Google link still requests anything from `fonts.gstatic.com`; **the census classes disagree with the links** before stage 7: `font-face-census-test` runs `tools/plex-census.mjs` on the working tree, so the set of pages is discovered, never listed, and fails a page of class (1), (2) or (4) that lacks `legacy-faces.css`, a class (1) or `article.css` page that links it after its Google source, a Next-chunk page that links it before the chunk, and a page the script cannot classify; in the browser it also asserts, on each Next-chunk page, that an Arabic sample at 400, at 500 and at 600 is served from `assets/fonts/` and not from `fonts.gstatic.com`, and, while the `@import` stays, that one at 300 still comes from `fonts.gstatic.com` (revision 14, P2: revision 13 did not name the sample's weight, and only 400 to 600 move); or a Plex family name other than these two appears (other than `Kiwi Arabic` after stage 7).

### 6.2 Scale (6 steps; 1 rem = 16 px before Dynamic Type)

| Step | rem / px | Regular | Strong | Line height (Latin / Arabic) | Tracking (Latin, Inter Tight) |
| --- | --- | --- | --- | --- | --- |
| Display | 2.75 / 44 | 600 | n/a | 1.05 / 1.25 | −0.02em |
| Title | 1.75 / 28 | 600 | n/a | 1.15 / 1.35 | −0.01em |
| Heading | 1.25 / 20 | 600 | n/a | 1.25 / 1.4 | 0 |
| Body | 1.0625 / 17 | 400 | 600 | 1.4 / 1.6 | 0.01em |
| Callout | 0.9375 / 15 | 500 | 600 | 1.35 / 1.5 | 0.01em |
| Footnote | 0.8125 / 13 | 500 | 600 | 1.35 / 1.5 | 0.015em |

**Why six, and why Caption went.** The brief allows "no more than six sizes per surface" (brief rubric 4). Revision 3 had seven steps and counted per layer, which let the till (Display for codes) and the dashboard (Display on Home, Callout in chips and the source chip) reach seven per surface without saying so. Revision 4 removes the seventh step instead of redefining the rule: Caption (12 px) is merged into Footnote (13 px). The only things that used Caption (tab, rail and sidebar labels, badges, chart axes and the legend) now use Footnote, and nothing in the product renders below 13 px.

**Rules:**
- **At most 6 distinct sizes per surface**, which the scale now guarantees. `type-steps-lint` divides every computed font size by **the root font size of the surface it renders in** times the Dynamic Type factor (§6.4), and fails any quotient that is not one of the six rem values (2.75, 1.75, 1.25, 1.0625, 0.9375, 0.8125), on every capture frame.
- **The kitchen is the same six steps on a scaled root, not a second scale.** The KDS sets `html[data-k-surface="kds"]{font-size: 20px | 24px | 28px}` (S, M, L, §13.6), and every kit size is in rem, so the KDS renders Display, Title, Heading, Body, Callout and Footnote at 1.25, 1.5 or 1.75 times their phone size. Its quotients are the same six values, so the lint passes it unchanged and it counts **6 steps, not 12**.
- **The root belongs to the surface, never to an embedded component.** When the till embeds the kitchen board (stage 3b), the board renders at the **till's** root (16 px), so the till still uses the same six steps; the 24 px root exists only on the kitchen surface (`kiwi-cuisine.html` and the KDS mode of the app). A kit component never sets its own root size, and `kit-lint` fails a `font-size` on `:host` or on any element other than `html`.
- **Buttons** (§10.1): L and M labels are Body strong; S labels are Callout strong; K labels are Body strong at the kitchen root. A **Plain** button takes the step of the text it sits beside (`step="footnote"` or `step="body"`).
- **Keypad digits** (PIN pad and cash keypad) are Title, tabular.
- **Labels under icons** (tab capsule, rail, sidebar collapsed) are Footnote 500, selected Footnote strong.
- Weights are 400, 500 and 600. Only Bold Text raises them, up to 700, which the Latin file contains (§6.1).
- No italics; no `text-transform`. Arabic tracking is always 0.

### 6.3 Numbers, dates and units (one formatter, `KiwiFormat`)

| | EN | FR | AR |
| --- | --- | --- | --- |
| Thousands | `,` | U+00A0 | U+00A0 |
| Decimal | `.` | `,` | `,` |
| Percent | `5.6%` | `5,6 %` (U+00A0) | `5,6 %` (U+00A0) |
| Share (revision 24, P4 and M2: a part of a whole, never a change; `share`) | `82%`, `5%` | `82 %` (U+00A0) | `82 %` (U+00A0) |
| Percentage point (a change in a percentage) | `1 pt` | `1 pt` | `1 نقطة` |
| Number to unit | U+00A0 + `MAD` | U+00A0 + `MAD` | U+00A0 + `درهم` |
| Negative | U+2212 prefix | same | same |
| **A change (delta) shown as a figure** (revision 11, M5; a change inside a sentence and the cash Difference follow the rule below the table) | An arrow (`arrow_upward` or `arrow_downward` 16) **and** the value from `signed`: `↓ −13 MAD`, `↑ +4`, `↑ +1 pt`, `↓ −1,127 MAD (−5.6%)` | `↓ −13 MAD`, `↑ +4`, `↑ +1 pt` | `↓ −13 درهم`, `↑ +4`, `↑ +1 نقطة` |
| Chart compact | `20K` | `20 k` | `20 ألف` |
| Time | `17:39` (24 h) | `17:39` | `17:39` |
| Elapsed | `45 min`, `Just now` under 1 min | `45 min`, `À l'instant` | `45 د`, `الآن` |
| Full date | `Monday 12 October` | `lundi 12 octobre` | `الاثنين 12 أكتوبر` |
| Short date (ranges, chips) | `3 Oct` | `3 oct.` | `3 أكتوبر` |
| Relative day (revision 10, P2: how it is produced is in the parts table below) | `today`, `yesterday`, `2 days ago` | `aujourd'hui` (U+0027), `hier`, `il y a 2 jours` | `اليوم`, `أمس`, `قبل يومين` |
| Weekday baseline | `last Monday` | `lundi dernier` | `الاثنين الماضي` |

Dates come from `Intl.DateTimeFormat` with the store's zone (§3 row 1), never the device's.

**One rule for every change, with its scope (revision 11, M5; revision 12, M4).** The rule has two forms, and which one applies depends on where the change sits, not on which figure it is:
- **A change shown as a figure** (a KPI tile's delta, the compare control's delta and its percentage, a change in a table cell or a list row's trailing value) is drawn as **an arrow plus the signed value**.
- **A change inside a sentence** (the chart's summary, `chart.summary_down`, `_up` and `_same`, and the Kiwi AI card, `ai.today_down`, `_up` and `_same`) is **unsigned, and its direction is a word** of the sentence ("down", "up", "less", "more"); a change that rounds to zero at the precision shown takes the `_same` key, so no sentence reads "0 MAD less" (revision 13, P9): "down −1,127 MAD" or "−1,127 MAD less" would say the direction twice and read as a double negative. The key, not the number, carries the direction, so each such sentence has a `_down`, an `_up` and a `_same` key.
- **The cash Difference is not a change; it is a balance, and it is a named exception.** It is counted minus expected at one moment, not a value against an earlier one, so it has no arrow: it is drawn signed by `signed` ("−18.00 MAD" short, "+2.00 MAD" over, "0.00 MAD" balanced), under the label `count.difference`, where the sign says short or over and so is never dropped; §18.9's measured width, which has no arrow, stands.

For the first form: the arrow is for the eye, the sign is for everything that reads the text (VoiceOver, a copy, an export), so neither depends on the other, and the tile and the compare control on one screen agree. The value always comes from `signed` (or `pct`, which signs the same way); a change of zero has **no arrow** and the unsigned `0` that `'exceptZero'` gives. Revision 10 drew tile deltas unsigned ("↓ 13 MAD") beside the compare control's signed "↓ −1,127 MAD", and its check 1 built the tile values with `Math.abs`; check 1 now builds every figure delta through `KiwiFormat.signed` and fails an unsigned one (§18.0, mutations 104 and 105), and builds the Kiwi AI sentence's delta unsigned with the word its sign selects, failing a signed one (mutation 110). The arrow's colour follows polarity (§10.21), never the sign.

**How `KiwiFormat` produces this table (revision 9, M3).** `Intl` alone does not: measured in the preview's Chromium 152 (ICU), it gives FR `19 174,50` with U+202F, AR (`ar-MA`) `19.174,50` with a full-stop group, AR percent as U+200E, `-5,6`, U+200E, `%`, U+200E (three bidi marks), the AR date `الاثنين، 12 أكتوبر` with an Arabic comma, EN compact `30.1k` in lower case, and hyphen-minus for every negative in every locale. So the formatter names its locales and then **assembles every string from `formatToParts`, by part type**, never by editing the formatted string:

| | EN | FR | AR |
| --- | --- | --- | --- |
| Locale tag | `en-GB` | `fr-FR` | `ar-MA-u-nu-latn` (Moroccan month names, as the merchants read them: ماي, يوليوز, غشت, شتنبر, نونبر, دجنبر; Latin digits) |
| `group` part becomes | `,` | U+00A0 | U+00A0 (whatever ICU emitted, including `ar-MA`'s `.`) |
| `decimal` part becomes | `.` | `,` | `,` |
| `minusSign` part becomes | U+2212 | U+2212 | U+2212 |
| `plusSign` part becomes (revision 10, P3) | `+` | `+` | `+` |
| `signDisplay` (revision 10, P3) | `'auto'` for an amount (`num`): a minus on negatives only; `'exceptZero'` for a change (`signed`, `pct`): `+` or U+2212, and no sign on zero; `'auto'` and no fraction digits for a share (`share`, revision 24, P4: a part of a whole, such as the goal line's 82% and a question's 5%) | same | same |
| Negative zero (revision 10, P3) | The value is rounded to the digits shown **before** formatting, and a result of zero is formatted as `0`: so a cash Difference of −0.004 prints `0.00 MAD`, never `−0.00 MAD`, and a change of −0.004 prints `0.00` with no sign | same | same |
| `literal` parts in a number | dropped (they are only U+200E, U+200F, U+061C and spaces) | dropped | dropped |
| `percentSign` | `%`, no space | U+00A0 then `%` | U+00A0 then `%` |
| Compact | the number to 1 decimal over 1,000 (or 1,000,000) through the same parts, then `K` (`M`), no space | then U+00A0 `k` (U+00A0 `M`) | then U+00A0 `ألف` (U+00A0 `مليون`) |
| Dates | `weekday`, `day` and `month` parts in that order, joined by one space; every `literal` part is dropped, so no comma of either script survives | same | same |
| Time | `hour` and `minute` parts, `hourCycle: 'h23'`, `2-digit`, joined by `:` | same | same |
| Relative day (revision 10, P2) | `Intl.RelativeTimeFormat` on `'day'`: `numeric: 'auto'` for 0 and 1 day back ("today", "yesterday"), `numeric: 'always'` from 2 days back, so the output is "2 days ago" and never ICU's own "the day before" words (measured in Chromium 152: FR `avant-hier` and AR `أول أمس` with `'auto'`). Parts: the `integer` part kept as is, `literal` parts kept as words with U+200E, U+200F and U+061C dropped and U+2019 written U+0027, the apostrophe every keyed string uses (ICU gives `aujourd’hui`) | same | same (AR keeps ICU's dual `قبل يومين` and its counted forms, `قبل 11 يومًا`) |

Then one assertion runs on every string the formatter returns: it holds none of U+200E, U+200F, U+061C, U+202F or hyphen-minus, or the formatter throws (in tests). **In production it never blanks a figure (revision 11, P12):** the string is repaired and drawn, and the event is reported. U+200E, U+200F and U+061C are dropped, U+202F becomes U+00A0 and hyphen-minus becomes U+2212, then `KiwiReportError(new Error('format-banned-char'), 'format:' + call)` is sent once per call name and page load, with the code points found and never the value. A repaired string is the same string the parts table would have built, so nothing on screen is wrong; the report says a browser's ICU has drifted from the vectors. Because the output is assembled by part type, a browser whose ICU emits a different grouping space, different bidi marks or a different minus produces the same string; WebKit is covered by `format-vectors-test`, run as follows (revision 10, M7: revision 9 named a WebKit runner the repository does not have).
- **What exists.** The repository's browser harness is `puppeteer-core` 24.43.1 driving the system Chrome (`app/node_modules/puppeteer-core`, used by `tools/design-capture/capture.mjs:605-621` and `tools/browser-trace.mjs`). There is no Playwright, no safaridriver script and no simctl harness at `31c94529`. So the Chromium half runs in that harness, in `check.js`, everywhere.
- **The WebKit half runs in the iOS Simulator, with no package.** `tools/format-vectors-ios.mjs` (new, stage 1, Node built-ins only) starts a local `http` server that serves a page loading `format.js` and the vectors, opens it in the booted simulator's Safari with `xcrun simctl openurl booted http://127.0.0.1:<port>/…`, and waits for the page to `POST` its results back to the same server; it fails on any vector that differs and records the simulator's iOS version with the result in `.kiwi/results/format-vectors/ios.json`.
- **Why this runner.** The tills are iPads and the guarantee is about Apple's WebKit and its ICU: the simulator runs the same WebKit and ICU as the iOS version it emulates. macOS Safari through `safaridriver` (built into macOS, also package-free) tests the Mac's ICU, not iOS's, and needs `safaridriver --enable` with an administrator once. Playwright's WebKit is its own build, not Apple's, and would add packages, a lockfile (CLAUDE.md §2) and a browser download. The simulator needs Xcode, which the iOS app already requires (`app/ios`).
- **Where it runs.** On the Mac that builds the iOS app, from `check.js` whenever `xcrun simctl` finds a booted or bootable iPhone or iPad simulator. Elsewhere (a machine without Xcode, and the two GitHub workflows, which only mirror and watch SEO) `check.js` prints it as **not run**, never as passed. The guarantee therefore sits on the release path, which is **`tools/app-archive.sh`** (revision 11, P8: revision 10 put it in `tools/build-app-www.mjs`, which has no release mode, `:243-247`, and is the plain build for every target, Android's `www/` included). After its existing gate (`node tools/check.js` on the exact commit, "Gate the exact commit", `app-archive.sh:33-38`) and before `npm ci`, the script runs `node tools/format-vectors-ios.mjs --require 15.5`, which fails the archive unless `ios.json` holds a pass for the current content hash of `format.js` and `tools/format-vectors.json` **on an iOS 15.5 simulator runtime**, the floor this spec proposes (§4.2), and on the newest runtime installed. A pass on some other runtime does not count, because the floor's ICU is the oldest the tills run. The runtime is named in one constant at the top of the script, so if the owner keeps a different floor (§4.2) that constant moves with it. Installing a 15.5 simulator runtime is a one-time step in Xcode's settings, done by the owner; if the installed Xcode cannot run it, the archive fails and says so, which is itself an input to the floor decision.

**Test vectors (`tools/format-vectors.json`, revision 9).** One table, read by `format.js`'s unit test, by `format-vectors-test` (Chromium in `check.js`, iOS WebKit through the simulator, above) and by check 1 of the preview (§18.0), which asserts every row before it compares a single figure and then builds its expected strings with the same formatter. U+00A0 is written ⍽ here.

| Call | EN | FR | AR |
| --- | --- | --- | --- |
| `num(19174.5, 2)` | `19,174.50` | `19⍽174,50` | `19⍽174,50` |
| `num(19174, 0)` | `19,174` | `19⍽174` | `19⍽174` |
| `num(−1127, 0)` | `−1,127` | `−1⍽127` | `−1⍽127` |
| `pct(−0.05551)` | `−5.6%` | `−5,6⍽%` | `−5,6⍽%` |
| `pct(0.042)` | `+4.2%` | `+4,2⍽%` | `+4,2⍽%` |
| `compact(20000)` | `20K` | `20⍽k` | `20⍽ألف` |
| `compact(30100)` | `30.1K` | `30,1⍽k` | `30,1⍽ألف` |
| `date('2026-10-12')` | `Monday 12 October` | `lundi 12 octobre` | `الاثنين 12 أكتوبر` |
| `short('2026-10-03')` | `3 Oct` | `3 oct.` | `3 أكتوبر` |
| `time('17:39')` | `17:39` | `17:39` | `17:39` |
| `num(−0.004, 2)` (revision 10, P3) | `0.00` | `0,00` | `0,00` |
| `signed(23, 0)` | `+23` | `+23` | `+23` |
| `signed(−1127, 0)` | `−1,127` | `−1⍽127` | `−1⍽127` |
| `signed(−0.004, 2)` | `0.00` | `0,00` | `0,00` |
| `pct(0)` | `0.0%` | `0,0⍽%` | `0,0⍽%` |
| `share(0.8159)` (revision 24, P4 and M2) | `82%` | `82⍽%` | `82⍽%` |
| `share(0.05)` | `5%` | `5⍽%` | `5⍽%` |
| `share(1.234)` | `123%` | `123⍽%` | `123⍽%` |
| `rel(0)` (revision 10, P2) | `today` | `aujourd'hui` | `اليوم` |
| `rel(1)` | `yesterday` | `hier` | `أمس` |
| `rel(2)` | `2 days ago` | `il y a 2 jours` | `قبل يومين` |
| `rel(11)` | `11 days ago` | `il y a 11 jours` | `قبل 11 يومًا` |
| `weekday('2026-10-05')` | `Monday` | `lundi` | `الاثنين` |

More rules:
- **Arabic isolation:** the number is wrapped in `<bdi dir="ltr">` with the unit outside it. No LRM or RLM characters are allowed in any string; the lint checks for them.
- **Tabular figures:** `font-variant-numeric: tabular-nums` on every number that can change or align (`tnum` exists in the Latin file). **No `zero` feature:** the file does not have it (§6.1), and every code the kit shows (PIN, attendance, printer, Z number) is digits only, so there is no O to confuse with 0. Revision 5's `font-feature-settings: "zero"` is withdrawn.
- **Spaces inside numbers are U+00A0, never U+202F.** ICU gives French U+202F as its group separator (and Arabic, depending on the tag, a comma or a full stop, never U+202F; measured above); neither bundled Latin nor Arabic file has U+202F (§6.1), so the browser would set it in a system font whose advance differs, inside widths measured with about 1 px to spare. `KiwiFormat` never passes ICU's separator through: it writes the `group` part from its own table above; `font-coverage-test` fails when a character the kit can emit is not drawn from the shipped file meant for it. **Revision 15 (M3) rewrites how it decides, because revision 14's rule passed the case it exists to catch.** That rule counted a `local()` face as covering its whole declared range, so U+202F, which sits inside the fallback face's range (U+2000-206F) and is in neither Inter Tight nor Arial, was reported covered while the browser set it in a system face (the round 15 critic measured "19\u202F174" at 53.34 px in macOS WebKit, against 55.05 px with U+00A0).
  - **What it reads: every character the kit can emit, not only letters and digits.** That is every value of `strings/*.json` in EN, FR and AR; every string `KiwiFormat` can return, generated by running it over its vectors and over every part its tables can produce (digits, separators, signs, `%`, the compact suffixes, the units MAD, درهم and نقطة, every weekday and month name of the three locales, the relative-day words); and every string in the preview's fixture. Merchant data that people type (a dish, a customer's name) is not in it: it can hold any character, and per-character fallback to `system-ui` draws what the files lack.
  - **How it resolves a character, once per target platform** (macOS, iOS, Windows, Android). It walks the stack the character is set in and stops at the first face whose `unicode-range` holds the character and whose source has its glyph on that platform.
    - **A `url()` face** has the glyph when the committed file's `cmap` has it.
    - **A `local()` face has the glyph only where a capture shows it.** `tools/fonts/local-faces.json` records, per platform, the `cmap` of the real font that each `local()` source names. `tools/font-cmap-dump.mjs` (stage 1, Node built-ins only) writes it from the file on disk: macOS from `/System/Library/Fonts/Supplemental/Arial.ttf`; iOS from the simulator runtime's `System/Library/Fonts/WebFonts/Arial.ttf` (read for revision 15 from the iOS 26.5 runtime); Windows from `C:\Windows\Fonts\arial.ttf`, captured once on a Windows machine and committed; Android as "no Arial". **A platform with no capture counts the face as covering nothing,** never everything.
    - **The other question a `local()` face raises** is whether it could take a character away from a shipped face listed after it. The same capture answers it, and with no capture the test assumes it could. So a missing capture can only make the test stricter.
  - **It fails when, on any platform:**
    - **loaded:** a character resolves to anything but its shipped file once the faces have loaded. A character of the Arabic blocks must reach Kiwi Arabic, and every other character Inter Tight. The fallback face is never the answer: it only stands in while Inter Tight loads;
    - **swapping:** a character that resolves to Inter Tight once loaded resolves, while Inter Tight is still loading, to anything but the fallback face, on a captured platform that has Arial (macOS, iOS, and Windows once captured). A character Arial lacked would be set in the system face during the swap, which is a layout shift. On Android, which has no Arial, every Latin character reaches the system face during the swap; §6.1 accepts that and measures it.
  - **What it finds for revision 16** (unchanged from revision 15: revision 16's new strings add no character). The corpus of §9.6, §6.3's parts and the fixture is 141 distinct characters (the round 16 critic counted 140 from a corpus that may have left out a fixture string; `tools/strings-corpus.mjs` prints the set, so the two can be diffed): 96 resolve to Inter Tight and 45 to Kiwi Arabic, on every platform. All 96 are in the macOS Arial and the iOS 26.5 Arial, so the swap check passes on both; Windows is reported as not captured, never as passed. U+202F fails the loaded rule (it is in no shipped file and in neither Arial), which is the case the critic measured; the lint of §9.6 bans it first. U+2068 and U+2069, which `KiwiStrings` adds in attributes only (§9.6), never reach a text node and are not in the corpus.
  - **Which stacks it walks.** They are discovered, not listed: every `font-family` value and `font` shorthand in `assets/kit/`, and every use of `--k-font`.
  - **Its negative controls:** revision 13's stack fails it on its first Arabic string, and a corpus holding "19\u202F174" fails it on U+202F; revision 14's rule passed both the second and a symbol inside Arial's range that Arial lacks.
- Every FR and AR width in §6.6 is measured with U+00A0, the only space inside a number the kit emits.
- **Precision is set per screen, not per figure:**
  - Overview screens (Home, KPI tiles, Customers lifetime spend) show whole MAD.
  - Screens where money is counted or listed show two decimals everywhere on that screen: till panes, menu tiles, bill, payment, Orders, Report, cash count, Z.
  - The same figure never appears at two precisions on one screen.

### 6.4 Dynamic Type: reconciled with the shipped plugin

There is **one source**: `KiwiDynamicType` (`app/plugins/kiwi-dynamic-type`). It is read by `applyDynamicTypeToWorkspace` (`app/src/native-runtime.js:390-431`), which listens to `dynamicTypeChange`, so changes from Control Center apply live.

**Shipped factors** (`scaleForCategory`):

| Category | xS | S | M | L | XL | XXL | XXXL and every AX size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Factor | 0.85 | 0.90 | 0.95 | 1.00 | 1.12 | 1.24 | 1.35 for XXXL; since `f99fa1e1`, 1.65 for AX M, 1.94 for AX L and 2.0 for AX XL to AX XXXL |

**Shipped mechanism** (kept):
- On iPhone, `-webkit-text-size-adjust: <factor>%` scales text, not boxes.
- On iPad, `--type-scale` is set and kit font tokens use `calc(<rem> * var(--type-scale, 1))`.
- Each device gets exactly one of the two, so text never scales twice.

**Kit geometry consequences:**
- Containers that hold text use `min-height` and padding, never `height`. `kit-lint` fails a fixed height on a text container, **except** these fixed-geometry elements, each checked at 1.35:

| Exempt element | Box | Text at 1.35 (size × factor × line height) | Fits |
| --- | --- | --- | --- |
| PIN key | 76 / 84 / 96 circle | Title: 28 × 1.35 × 1.15 = 43.5 | ✓ |
| Cash keypad key | 64 (phone) / 72 (iPad) tall | Title: 43.5 | ✓ |
| Avatar | 40 / 56 | Footnote strong initials: 13 × 1.35 × 1.35 = 23.7 | ✓ |
| Qty box (bill 32 wide, KDS 48) | 32 × 24 / 48 × 48 | Callout strong 15 × 1.35 × 1.35 = 27.3 in the bill box, which therefore becomes `min-height: 28` | ✓ after the change |
| Switch | 51 × 31 | No text | ✓ |

- The **badge** is no longer fixed: `min-width: 20; min-height: 20; padding-inline: 5`, Footnote strong, line height 1.35. At factor 1 the text needs 13 × 1.35 = 17.6, inside 20; at 1.35 it needs 23.7, so the badge grows to 24 and its capsule radius follows (§10.13).
- **Rules by factor band:**

| Component | ≤ 1.12 | 1.24 | 1.35 |
| --- | --- | --- | --- |
| KPI grid (compact) | 2 columns | 1 column | 1 column |
| List row | Trailing value inline | Inline | Trailing value stacks under the title |
| Segmented | Segments are sized to their labels (§10.6). Becomes a scrolling track when the labels plus their padding are measured not to fit the track | Same rule | Same rule |
| Tab capsule (compact, 4 or 5 tabs) | **Labels when they fit, else icon only, at every factor:** the capsule measures its labels (each item max(44, label + 16), the selected label at 600) against its content width and shows icon + label only if they fit; otherwise every item is icon only and a long press shows the label HUD (§10.20). Never a scrolling bar, never a shortened string. The measured outcome per width, language and factor is the table after §6.6 | Same rule | Same rule |
| L button (min-height 56, padding-block 12, inline 20, §10.1) | One line at factor 1, measured in §6.6; above 1 the icon drops first, then the label wraps to at most 2 lines | 2 lines at most, centred, height grows | Same |
| Menu tile | Name 2 lines | Name 3 lines | Name 3 lines; grid drops one column |
| Bill line | Wraps freely | Same | Same |
| KDS | Not affected (own root, §13.6) | | |

- **Cap (revision 24, read at `f99fa1e1`):** 1.35 for every surface except **the owner dashboard on iPhone, which follows the accessibility sizes up to 2.0** (`app/src/native-runtime.js@f99fa1e1:401-415`: `ceiling` is 2 on `dashboard.html` on iPhone, 1.35 elsewhere; the till, waiter and kitchen screens keep 1.35). Above 1.35 the page carries `.kiwi-large-type`, and `app/src/native-runtime.css@f99fa1e1:1214-1226` reflows it: the header capped at 125 %, columns stacked, labels wrapped instead of cut, list rows on one column; `tools/dynamic-type-200-browser-test.mjs` guards it. **This direction designs geometry to 1.35 only.** Above 1.35 its dashboard frames follow the same reflow rules, and that suite must stay green at every stage; drawing them is the round §23.4 names.
- **No reflow on load:** an inline `<head>` script applies the last factor (cached as `localStorage['kiwiTypeScale']` by the runtime on every plugin event) before first paint. The plugin's answer corrects it only if the setting changed while the app was closed.

### 6.5 Font loading
- **One font folder, one URL per file.** Every face lives in `assets/fonts/` (self-hosted, §6.1) and is referenced with a `?v=` stamp. The app's `www/` is built from the same tree (`tools/build-app-www.mjs`), so the app serves the **same** file at the same relative path; there is no second copy.
- **Web:**
  - `<link rel="preload" as="font" type="font/woff2" crossorigin href="assets/fonts/<file>.woff2?v=N">` for the Latin file only. The shell carries the stamp, so `bump-stamp` sees it (§21.3).
  - `@font-face` rules live in `assets/kit/tokens-2027.css` and point at `../fonts/<file>.woff2?v=N`. The stamp tool resolves a CSS `url()` against **the folder the CSS file is served from** before keying it (§21.3). For a file under `assets/` that is its own folder, so `../fonts/x.woff2` from `assets/kit/` and the shell's `assets/fonts/x.woff2` are **one** asset key with one stamp; `stamp-drift-test` fails if the two stamps differ.
  - `font-display: swap`, with the measured fallback face from §6.1.
- **App (the native CSS is part of the plan):**
  - Today **two** native CSS files declare faces from `native-fonts/…`, copied by `NATIVE_FONTS` (`tools/build-app-www.mjs:49-57`): `app/src/native-runtime.css:1-5` (Inter Tight, Plex Arabic 400/500/600, JetBrains Mono) and **`app/src/native-shell.css:4-7`** (Inter Tight and Plex Arabic 400/500/600; the setup shell's stylesheet, copied to the www root by the `SHELL` loop, `:44` and `:204`). Revision 6 named only the first. **On the web no Kiwi stylesheet declares a face today** (Google Fonts links do); stage 1's `legacy-faces.css` (§6.1, revision 10, M2) is the web's legacy declaration until stage 7.
  - **Where those files are served from.** Their source is `app/src/`, but the build copies both to **the root of `app/www/`** (`NATIVE_RUNTIME` at `:48`, copied at `:164-168`; `SHELL` at `:44`, copied at `:204-213`), and pages link them by bare name. A `url()` inside either therefore resolves against the www root: `url("assets/fonts/x.woff2")` is right and `url("../assets/fonts/x.woff2")`, which a source-relative reading would suggest, points outside the bundle.
  - **One stage moves a face, and it moves every reference to it.** The face stays Inter Tight (§6.1), so no use site changes; only where the file lives does. In **stage 1**, in one commit: the `@font-face` rules in **both** `native-runtime.css` and `native-shell.css` point at `assets/fonts/<file>.woff2?v=N` (from the www root, as above); `assets/fonts/` is added to the bundle (`bundledFolders` in `tools/app-bundle-manifest.json`, §21.3); and only then are the matching `NATIVE_FONTS` entries (Inter Tight and the three Plex weights) deleted. JetBrains Mono keeps its `NATIVE_FONTS` entry and its `native-fonts/` rule until stage 7 retires the face and its `@font-face` together. `bundle-manifest-test` fails the build if any `url()` in any CSS file copied to the www root resolves to a file that is not in the built `www/`, so a font cannot leave the bundle while a rule still names it.
  - **What stage 1 changes on screen, stated rather than assumed.** In the app the bytes are the same files from the same `node_modules` paths, served from a new path, so the app's text is unchanged; stage 1's app capture diff must be pixel-identical, and that is the gate, not a claim. On the web the 36 pages whose Google Plex comes from their markup or from `article.css` do not change at stage 1; the 11 Next-chunk pages move their Arabic **at 400, 500 and 600** to the self-hosted build of Plex, while their Arabic at 200 and 300 and their Latin set in Plex stay on Google's faces until the `@import` goes (revision 14, P2), and the 4 with no Plex get Plex for their Arabic (§6.1, revision 12, M5, each with an AR capture review); each Google page keeps its Google Fonts link until its surface adopts the kit behind its flag (stages 3 to 6), and the self-hosted file replaces Google's build of the same family there, which can differ in hinting and subsetting, so those stages' capture diffs are reviewed, not assumed zero.
  - Network font links are stripped (`NETWORK_FONT_RE`); the splash waits for fonts (`capacitor.config.ts`, SplashScreen comment).
- **One Latin family:** a page loads exactly one Latin face, Inter Tight, from one URL per file. Kit components take their face from the kit's own `--k-font` (§6.1, revision 9, M4), never from the page's `--sans`. `font-face-census-test` loads every adopted page in the app shell and on the web and fails if more than one Latin family is requested, or if one character at one weight is requested from two URLs, observed on the network (§6.1's rule; revision 17, P5: the two deliberate overlaps it names, stage 1's Plex Arabic and Inter Tight's two subsets, each cause one request and pass).
- **Self-hosting replaces Google Fonts on the web** (today `dashboard.html` loads Inter Tight, Plex Arabic and JetBrains Mono from `fonts.googleapis.com`). An offline till cannot depend on a third-party CDN.

### 6.6 Measured fits (every one-line label, at its narrowest container)

Every label that §10 and §18 draw on one line was measured in a browser **in the shipped faces only** (revision 7): Inter Tight variable Latin, the 44,872 B file of §6.1, at the §6.2 tracking, and IBM Plex Sans Arabic 400/500/600 at its 108 % `size-adjust`, at each label's step and weight, with real U+00A0 in the amounts (§6.3), **and with the font features its frame sets**: every frame sets `font-variant-numeric: tabular-nums`, so every label is measured with `tnum` (revision 25, P8: the goal line was measured without it and was 2.6 px narrow). Widths are CSS px at factor 1. The budget is the container's content width minus the component's inline padding (§10.1, §10.6, §10.7) and, where drawn, the icon and its gap. The last column keeps the earlier copy and why it changed; numbers there are the earlier revisions' own measurements (in Inter for revision 6), kept only as the reason for the edit. `label-fit-test` repeats every row from the strings bundles on every capture run, **logs the face it measured and the width of a reference label** ("Send 2 to kitchen" at Body strong, 136.1), and fails on the first overflow or on a reference width that is off by more than 0.3 px (a fallback face); this table is its seed. The preview runs the same reference check in the browser that draws it.

**Re-measured under the revision 14 stack (B1).**
- **How.** Every Arabic cell below, in the main table and in both factor tables, was measured again in Chromium 152:
  - in the shipped stack, `"Inter Tight", "Kiwi Arabic", "Inter Tight Fallback", system-ui`, with the fallback face declared as §6.1 ships it;
  - each label at its step, weight and tracking, with tabular figures;
  - each composite cell by its stated formula.
- **Result.** Every cell equals the published figure to 0.1 px, so no number changes. §6.6 was measured with Kiwi Arabic first and its Arabic-only range, which resolves every character exactly as the corrected stack does.
- **Whole-corpus check (revision 15, P14: the count is generated, and its rule is stated).**
  - **How strings are counted.** A string is a row of §9.6 whose first cell starts with a backticked key; a row that lists several keys (`settings.business` / `.devices` / …) is one string, as drawn. An Arabic string is such a row whose AR cell holds at least one Arabic letter (U+0621 to U+064A).
  - **The count.** By that rule §9.6 has 580 rows and 572 Arabic strings with stage 3b's kitchen: stage 3b adds 23 `kds.*` rows, all Arabic strings, for what the shipped board draws and the lanes now carry (the Preparing and Ready empty lines, loading and offline, the source capsules, the next course, recall, a station done, the ready time, the unsynced line, the cancellation alert with its reasons, and the recipe button's name on the till's board); 557 and 549 at revision 25 with stage 2's kit: stage 2 adds 7 rows, all Arabic strings, for controls the kit draws (`stepper.decrease`, `.increase` and `.value`, `field.clear`, `range.prev_month` and `.next_month`, `options.note`); 550 and 542 before it, at revision 25 itself: it adds 27 rows, all Arabic strings, for the round 25 critique (14 for the online orders' home, M2; the four trades' suggestions and the two follow-up rows, M1; 2 for the quick messages, M3; `till.more.cancel_sale` / `.close`, P10; 4 for Settings' Delivery channels and Morning briefing, P11), and removes 3, `ai.suggest.compare`, `.reorder` and `.best_after`, whose questions the trade's rows replace (M1); 526 and 518 at revision 24, which adds 34 rows, all Arabic strings, for the round 24 critique (22 for the till's More and the acts' entries, M1; 10 for the daily goal, onboarding's goals step and the first card's eyebrow, M2; `ai.actions.button`, P2; `ai.suggest.ops.*`, P8), and `customers.segment.vip` stops being an Arabic string, because its Arabic cell is now "VIP" (P5); 492 and 485 at revision 23, which removes 24 `floor.*` rows, 20 of them Arabic strings, because the floor is kept as shipped (§18.4), keeping `floor.table`, which the bill header uses; and it adds 32 rows, all Arabic strings, for the round 23 critique (25 for Kiwi AI, 4 for invoices and exports, `customers.segment.vip`, the Customers overflow and `ia.invoicing` / `.accounting`); 484 and 473 at revision 22 (revision 22 adds `lock.store.open_without`, the `floor.tag.*` and `floor.fixture.*` rows and `floor.table_tagged_a11y`, whose Arabic cell holds only arguments and Arabic commas, so it is not an Arabic string); 480 and 470 at revision 21 (revision 21 adds `pin.dashboard.no_owner_code` and `act.discount.amount` and replaces the 11 store-lock keys of revision 20 with the 8 `lock.store.*` keys of §10.26; 481 and 471 at revisions 19 and 20; revision 19 adds `pin.till.handover_sub`, `pin.till.not_incoming`, `pair.no_answer` and `pair.maybe_used`; 477 and 467 at revision 18; 460 and 450 at revision 17; revision 18 adds `pin.till.needs_connection`, `pin.connection_back`, `clock.code_expired` and the 14 `act.*` keys; 454 and 444 at revision 16). Revision 14 printed 442, a count made by hand. `tools/strings-corpus.mjs` (stage 1, the parser `strings-lint` uses) computes both numbers from the table, and `label-fit-test` prints them, so no revision types them again.
  - **The measurement.** Revision 16 measured the 444 strings plus the 8 formatted amounts and dates these rows use, 452 strings, at the 8 step and weight pairs the rows use: 3,616 measurements. Revision 18 re-ran it for the 467 strings at all 9 step and weight pairs of §6.2, a superset of those 8: 4,203 measurements, in Chrome 155 headless through the repository's `puppeteer-core` (the 8 formatted values are unchanged and were not re-measured). They differ by at most 0.016 px between the shipped stack and the stack §6.6 was measured in (`"Kiwi Arabic", "Inter Tight"`), and none by more than 0.1 px. Revision 13's stack moves 3,608 of the 3,616, because every Arabic letter goes to Arial. Revision 19 measured its four new Arabic strings and the changed `clock.code.sub` at the same 9 pairs in Chrome 155, 45 measurements: they differ by 0 px between the two stacks. Revision 21 measured its 10 new or changed Arabic strings (`pin.dashboard.no_owner_code`, `act.discount.amount` and the 8 `lock.store.*` keys) at the same 9 pairs in Chrome 155, 90 measurements: they differ by at most 0.016 px between the two stacks, and none by more than 0.1 px. Revision 22 measured its 11 new or changed Arabic values (`lock.store.reload`, `lock.store.open_without`, the four `floor.tag.*` and the five `floor.fixture.*` values) at the same 9 pairs in Chrome 155, 99 measurements: they differ by 0 px between the two stacks. Those floor values were removed in revision 23 with their rows. Revision 23 measured its 54 new or changed Arabic values (the 32 new rows' values, and `pay.other`, `orders.other`, `customers.search`, `ai.placeholder` and the two `lock.store.*` values it changed) at the same 9 pairs in Chrome 155, 486 measurements: they differ by 0 px between the two stacks. Revision 24 measured its 54 new or changed Arabic values (the 34 new rows' values and the changed `ai.actions.pending_a11y`) the same way, 486 measurements: they also differ by 0 px. Revision 25 measured its 47 new Arabic values (the 27 new rows' values) the same way, 423 measurements: they also differ by 0 px.
- **What `label-fit-test` therefore logs.** It logs two reference labels and fails when either is off by more than 0.3 px:
  - "Send 2 to kitchen" at Body strong, 136.1;
  - the Arabic `bill.send`, "أرسل إلى المطبخ · 2", at Body strong, 136.4. Under revision 13's stack it measured 110.6, so a face that takes Arabic letters can no longer pass it.

**Interpolated names (revision 11, P10).** A string that carries a store, venue, person or dish name (`{store}`, `{paired}`, `{name}`) cannot be measured, because the name is the merchant's. So such a string is **never set on a one-line control**: it is a heading or body text that wraps (the store lock's title and body, §10.26; the pairing pad's success line), and where a name must sit near a button, the button keeps a fixed verb and the name goes in the text above it. Revision 10's `sync.pair_back` "Pair with {store}" broke this rule and is gone with the banner it sat in. `label-fit-test` fails a one-line control whose key holds an ICU argument other than a formatted number, and draws the lock's title and body with a 40-character store name at the narrowest till width, 744, in all three languages, asserting that they wrap and clip nothing.

**Containers.** Bill pane 432, 360 and 320 wide (content 384, 312, 272); iPhone SE content 343; the 720 cash-count sheet's list column 360; the guest popover 360 (content 312); the till rail 88.

| Label (key) | Where, narrowest | Budget | EN | FR | AR | Earlier copy (what changed) |
| --- | --- | --- | --- | --- | --- | --- |
| `bill.send` "Send 2 to kitchen" | L primary with icon, pane 320: 272 − 40 − 28 | 204 | 136.1 | 168.8 | 136.4 | "Envoyer 2 articles en cuisine" was over by 29.9 (revision 4) |
| `bill.take_payment` "Charge 230.00 MAD" | L primary, pane 320: 272 − 40 | 232 | 162.4 | 181.3 | 146.3 | "Take payment · 230.00 MAD" was over (revision 4) |
| `pay.cash.confirm` "Confirm cash payment" | L primary, pane 320 | 232 | 176.9 | 147.1 | 100.7 | Amount and change were in the label, 421.9 in FR; they now sit in the key figure and the change line above |
| `pay.card.confirm` "Confirm card payment" | L primary, pane 320 | 232 | 174.0 | 193.2 "Valider le paiement carte" | 129.8 | Revision 6: verb first (it was "Card approved · confirm") |
| `discount.apply` "Apply −23.00 MAD" | L primary, pane 320 | 232 | 150.7 | 181.2 | 136.8 | 279.8 in FR (revision 4) |
| `split.pay_share` "Charge share 1" | L primary, pane 320 | 232 | 119.2 | 143.8 | 107.6 | 314.6 in EN (revision 4); the share's amount is the key figure above |
| `options.add` "Add to bill · 150.00 MAD" (Tajine poulet citron, which has options) | L primary, options popover 360: 312 − 40 | 272 | 191.1 | 171.3 "Ajouter · 150,00 MAD" | 236.2 "أضف إلى الحساب · 150,00 درهم" | FR "Ajouter à l'addition · …" left 0.1 (revision 5): shortened |
| `action.done` | L primary, pane 320 | 232 | 41.2 | 63.6 | 17.8 | |
| `bill.split` "Split" | M half row with icon, pane 432: (384 − 8) / 2 − 32 − 28 | 128 | 34.6 | 53.8 "Diviser" | 36.9 | "Diviser l'addition" and "Ajouter une remise" were over (revision 4); FR "Partager" (revision 5) became "Diviser" (revision 6) |
| `bill.discount` "Discount" | same, pane 360: 92; pane 320: 72 | 72 | 69.7 | 57.3 | 41.4 | Fits the 320 half button with 2.3 to spare in EN; **320 still draws the row as toolbar items** (116 per item: 53.8 / 44.2 / 31.6 at Footnote strong, §10.23), because 2.3 px is one copy edit from an overflow and the row's form must not depend on the language |
| `menu.enter_amount` | M secondary with icon, sized to content | none | 105.1 | 136.2 | 78.1 | Was fixed at 160 wide (revision 4) |
| `receipt.print` / `receipt.send` | M secondary with icon, pane 320: 272 − 32 − 28 | 212 | 94.9 / 98.5 | 134.8 / 127.7 | 90.9 / 93.6 | |
| `invoice.a4` (revision 23) | same | 212 | 81.8 | 85.9 | 67.5 | |
| `ai.calculator` + `ai.attach` (revision 23): two M secondaries with icons, 8 apart | Kiwi AI sheet, 400 | 400 | 140.1 + 8 + 112.0 = 260.1 | 153.2 + 8 + 118.4 = 279.6 | 148.3 + 8 + 92.3 = 248.6 | |
| `ai.placeholder` (revision 23), Body | field 344 − 16 − 44 − 8 beside the mic | 276 | 154.3 | 258.0 | 120.2 | "Ask about your sales, stock or team" was 265.0, 469.8 and 263.3 |
| `home.goal` + 8 + the 96 mark (revision 24, M2; re-measured with `tnum` in revision 25, P8), Footnote | SE content 343; 6.9 content 400 | 343 / 400 | 276.2 | 303.2 | 264.0 | At 1.12: 296.8, 327.1, 283.2; at 1.24: 317.5, 351.0, 302.4; at 1.35: 336.3, 372.7, 319.9. No breakpoint moves: one line on the 6.9 at every factor; on the SE the FR line is over 343 from 1.24, and there the mark moves under the text (4 below it), so the line grows by 8 and nothing is cut. Revision 24's figures without `tnum` were 273.6, 300.6 and 261.4. `home.goal_set` (Footnote strong): 90.4, 140.6, 84.3 at factor 1, 121.9, 189.7, 113.8 at 1.35, centred in its own 44 row (§18.1) |
| `nav.ai` capsule (revision 25, P13): `auto_awesome` 24 + 8 + `ai.title` "Kiwi AI" (Callout strong) + 12 at each end | Home nav bar, 8 before the bell | 102.9 at factor 1 | 102.9 | 102.9 | 101.8 | The label is the same Latin words in every language: 46.9 at factor 1, 52.5 at 1.12, 58.1 at 1.24, 63.3 at 1.35 (capsule 119.3); the Arabic frame sets no tracking, so 45.8 there. Revision 25's draft took 61.1, "Kiwi AI" at Heading, the sheet title's step. Clearance from "Café Atlas": 91 on the 6.9, 34 on the SE, 93.8 in Arabic (§18.1, §18.11) |
| `ai.suggest.*` rows 1 to 3 (revision 25, M1), Body | Kiwi AI group, 400 − 32 | 368 | ≤ 268.4 | ≤ 324.1 | ≤ 197.3 | The twelve questions, one line each at factor 1; the longest are EN "Why is my average basket falling?" (250.1) and "Which dish should I drop?" (190.0) for the restaurant, EN spa "Which service fills my quiet hours?" (255.4), FR "Prévision des encaissements cette semaine" (324.1). A row wraps at larger sizes (§10.8) |
| `till.team.quick` (revision 25, M3): four chips, padding 16, gap 8, Callout strong | team message sheet: iPad 672; phone SE 343 | 672 / 343 | 447.1 | 430.2 | 458.0 | Labels 79.9, 122.0, 20.0, 73.2 (EN); 77.1, 88.4, 46.6, 66.1 (FR); 87.1, 64.1, 57.5, 97.3 (AR). One row on an iPad, two on a phone; the "Till" chip is 52 wide, above the 44 minimum |
| Online order actions (revision 25, M2), Item buttons, Body strong | Takeaway card, 856 menu pane (content 808) and phone 343 | 808 / 311 | ≤ 151.5 | ≤ 170.4 | ≤ 135.5 | Labels: `online.accept` 121.4, 145.4, 113.7; `kds.mark_ready` 87.8, 101.4, 74.7; `kds.mark_served` 97.3, 108.1, 80.0; `online.hand_over` 79.8, 71.9, 32.5; `takeaway.reject` 49.0, 60.6, 42.5; `online.cancel` 54.4, 61.4, 21.0; `bill.take_payment` "Charge 84.00 MAD" 151.5, 170.4, 135.5. The three of a card hold one row on an iPad; on a phone they wrap to two |
| `ai.actions.button` capsule (revision 24, P2), Callout strong | header, between the title and close | 136.5 at factor 1 | 136.5 | 136.5 | 141.2 | At 1.35: 158.9, 158.9, 165.2, with 98.6 (EN, FR) and 92.3 (AR) left free after the title (§18.6) |
| `count.close` / `count.open` | L primary, 720 sheet footer: 672 − 40 | 632 | 95.6 / 93.5 | 134.4 / 119.2 | 103.0 / 99.7 | |
| `cancel.confirm` / `cancel.keep` | L, phone SE sheet: 343 − 40 | 303 | 203.8 / 75.2 | 240.2 / 118.4 | 180.9 / 92.3 | |
| `ob.create`, `ob.finish`, `team.signin.next`, `clock.in`, `clock.out` | L primary, SE | 303 | ≤ 143.0 | ≤ 174.2 | ≤ 127.0 | Revision 15 (P8): AR `ob.create` is now أنشئ حساب Kiwi, 124.7 at Body strong, inside the group's 127.0 |
| `ob.forgot.send`, `ob.forgot.support`, `ob.reset.again`, `ob.reset.save` | L primary, SE | 303 | ≤ 184.8 | ≤ 211.7 | ≤ 181.0 | |
| `bill.view` + amount (bill bar) | SE: 40 + 28 + label + 16 + amount ≤ 343 (§10.32) | 343 | 250.2 | 292.6 | 291.1 | One string, over in FR (revision 4) |
| `pay.exact` "Exact", "250.00", "300.00" | 3 chips, padding 16, gap 8, pane 320 | 272 | 251.1 | 251.1 | 257.5 | "Exact 230.00 MAD" chip, over in FR (revision 4) |
| `count.same_as_last` "Last float · 500.00 MAD" | chip, padding 16, list column 360 − 32 − 32 | 296 | 160.9 | 181.9 | 153.5 | "Comme à la dernière ouverture · 500,00 MAD" was over (revision 4) |
| `count.denom` longest "0.50 MAD"; subtotal "6,000.00" | cash-count row (§18.9) | 144; 96 | 76.4; 70.4 | 76.4; 70.5 | 75.3; 69.1 | "Pièce de 0,50 MAD" was over 120 (revision 4) |
| Range segmented (4) | compact track, SE 335, label + 24 each | 335 | 281.9 | 281.7 | 222.6 | |
| Orders filter (5; revision 23 adds `orders.other`) | same; 392 at 440 | 335 / 392 | 284.6 | 372.2 | 285.0 | FR is over the SE's 335, so there the control is the scrolling track (§10.6); one row at 440. Four segments measured 221.4, 314.9 and 232.4 |
| Customers filter (5, with counts; revision 23 adds `customers.segment.vip`) | same; 392 at 440 | 335 / 392 | 328.5 | 358.3 | 313.4 | Revision 24, P5: AR re-measured with "VIP 1" (311.3 with كبار). FR is over the SE's 335, so there it scrolls (§10.6); one row at 440. Four segments measured 277.4, 307.2 and 263.4 |
| Split mode / discount mode (2 each) | default track, pane 320: 272 − 8 | 264 | 149.1 / 156.5 | 216.1 / 194.4 | 192.9 / 108.3 | |
| Kitchen stations (5, with counts) | KDS S root 20, iPad 11 portrait track 586, label + 30 | 586 | 434.3 | 532.6 | 471.1 | |
| Dashboard tab capsule (5) | SE 335 | 335 | 292.2 | 315.9 | 262.2 | **The f 1 column of the capsule table below**, measured once by its method (the selected item at 600, every other at 500); revision 6 printed a second set from another method here (P1) |
| Till tab capsule (5) | SE 335 | 335 | 290.5 | 308.4 | 274.5 | Same |
| Team tab capsule (4) | SE 335 | 335 | 200.3 | 207.7 | 223.9 | Same |
| Till rail labels | 88 − 2 × 4 | 80 | ≤ 60.7 | ≤ 68.3 | ≤ 59.4 | |
| KDS K buttons (Mark served, Mark ready, Start) | ready lane 240 − 48, at root 24 | 192 | ≤ 145.9 | ≤ 162.2 | ≤ 120.1 | |
| Compare control (§10.33) | one line: 16 + 4 + delta + 6 + baseline + 4 + 16 = 46 + text, SE content 343 | 343 | 304.5 | 329.5 | 310.2 | All three are one line on the SE at factor 1; thresholds per factor in the table after the capsule's |
| Date button "Today · Monday 12 October" | SE: 343 − 44 | 299 | 164.3 | 173.6 | 119.8 | |
| Chart legend, in its band (§10.22): `chart.legend_today` + `chart.legend_yesterday_at` | the band spans the plot width, SE 343; two swatches 16 + 6 and a 12 gap | 343 | 36.0 + 112.7 + 56 = 204.7 | 67.3 + 73.5 + 56 = 196.8 | 26.4 + 95.6 + 56 = 178.0 | Revision 7: it sits in a reserved band no data enters, so its width is checked against the plot, not against the data's shape |
| Home tile labels and `home.returning_value` "of 8 customers" | SE tile 165.5 − 32 | 133.5 | ≤ 91.2 / 88.9 | ≤ 90.6 / 71.5 | ≤ 78.9 / 82.0 | "of 8 known customers" was over (revision 4) |
| `home.latest`, `home.see_all_orders` | SE section label 343; row 343 − 60 | 343 / 283 | 79.8 / 135.9 | 135.8 / 185.4 | 62.9 / 167.4 | |
| Tip row value `pay.tip.pct` "10% · 23.00 MAD" and `pay.tip_breakdown` "Bill 230.00 · Tip 23.00" | row trailing value, pane 320; breakdown 272 | 272 | 133.2 / 131.9 | 137.4 / 202.6 | 135.0 / 189.0 | The five tip options as one chip row would be 356.9 / 429.1 / 424.0, which is why they are a popover |
| Key figure with a tip "253.00 MAD" (Title) | payment pane 272 | 272 | 161.6 | 161.6 | 166.1 | |
| `attendance.replace` "Replace the code on every till" | L secondary, SE sheet 303 | 303 | 227.3 | 314.8: wraps to 2 lines (§6.4 L button rule) | 197.9 | |
| `ob.reset.retry_in` "Try again in 15 min" | Body line, SE 303 | 303 | 141.6 | 176.5 | 148.6 | |
| `sync.saved_here`, `bill.not_sent` | pane 272 | 272 | ≤ 145.3 | ≤ 158.4 | ≤ 154.0 | |
| `sync.screen_only` (Footnote strong; a sentence that may wrap, not a one-line label) | pane 272 | 272 | 287.5, 2 lines | 374.9, 2 lines | 283.1, 2 lines | New in revision 8 (F1); never more than 2 lines at factor 1 |

**Measured at every Dynamic Type factor.** The capsule and the compare control are the two one-line components whose fit changes with the factor; both are measured at 1, 1.12, 1.24 and 1.35, with Footnote at 13 × f px, in Inter Tight.

**Tab capsule, widest case (sum of max(44, label + 16) with the longest label selected at 600 and the others at 500), against the capsule's content width (screen − 2 × margin − 2 × 4): 335 on the SE (375), 353 on 393-wide phones, 354 at 402, 392 at 440.** **This is the only set of capsule numbers in the spec**; the main table's capsule rows are its f 1 column.

| Capsule | Lang | f 1 | f 1.12 | f 1.24 | f 1.35 | Labels shown on |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard (5) | EN | 292.2 | 317.7 | 343.2 | 366.4 | f ≤ 1.12 on every width; f 1.24 from 393; f 1.35 at 440 |
| Dashboard (5) | FR | 315.9 | 340.9 | 368.6 | 394.1 | f 1 on every width; f 1.12 from 393; f 1.24 at 440; icon only at 1.35 |
| Dashboard (5) | AR | 262.2 | 284.0 | 305.8 | 325.9 | Every width, every factor |
| Till (5) | EN | 290.5 | 315.7 | 341.0 | 364.1 | f ≤ 1.12 on every width; f 1.24 from 393; f 1.35 at 440 |
| Till (5) | FR | 308.4 | 332.4 | 359.3 | 384.0 | f ≤ 1.12 on every width; f 1.24 and 1.35 at 440 |
| Till (5) | AR | 274.5 | 297.8 | 321.2 | 342.6 | f ≤ 1.24 on every width; f 1.35 from 393 |
| Team (4) | EN, FR, AR | ≤ 223.9 | ≤ 239.7 | ≤ 255.5 | ≤ 270.0 | Every width, every factor |

The fallback is the icon-only capsule with the label HUD, for every item at once: an icon-only item is 44 wide, so five need 220 and fit every width at every factor. The selected item does not keep its label alone, because then the capsule's layout would change with the selection.

**Compare control (§10.33), one line = 16 + 4 + delta (Footnote strong) + 6 + baseline (Footnote) + 4 + 16, against the content width: 343 on the SE, 361 at 393, 362 at 402, 400 at 440.** When one line does not fit, the control is **two rows inside the same button**: row 1 is the arrow and the delta, row 2 the baseline and `expand_more`; the button's min-height stays 44 and grows only when two Footnote lines need more (35.1 at f 1, so no growth; 47.4 at 1.35).

| Lang, baseline | f 1 | f 1.12 | f 1.24 | f 1.35 | One line on |
| --- | --- | --- | --- | --- | --- |
| EN, "vs yesterday at 17:39" | 304.5 | 335.5 | 366.6 | 394.9 | f ≤ 1.12 on every width; f 1.24 and 1.35 at 440 |
| EN, "vs last Monday at 17:39" | 318.2 | 350.9 | 383.6 | 413.4 | f 1 on every width; f 1.12 from 393; f 1.24 at 440 |
| FR, "par rapport à hier à 17:39" | 329.5 | 363.5 | 397.5 | 428.6 | f 1 on every width; f 1.12 and 1.24 at 440 |
| FR, "par rapport à lundi dernier à 17:39" | 380.3 | 420.4 | 460.5 | 497.2 | f 1 at 440 only |
| AR, "مقارنةً بالأمس عند 17:39" | 310.2 | 341.9 | 373.6 | 402.6 | f ≤ 1.12 on every width; f 1.24 at 440 |
| AR, weekday | 371.9 | 411.0 | 450.1 | 485.9 | f 1 at 440 only |

The widest two-row case is FR weekday at 1.35: row 1 198.4, row 2 292.8, both inside 343, so there is no third form. §18.11's SE hero (EN, f 1) is one line, 304.5 of 343.

**Tightest margins**, named so a later copy edit sees them (revision 23: the floor's, which the direction no longer draws, are gone): `bill.discount` in EN in the 320 half button (2.3, which is why 320 draws the toolbar form); the French dashboard capsule at f 1 on the SE (19.1) and the French orders filter (20.1). Any edit to these strings re-runs `label-fit-test` before merge.

---

## 7. Space, grid, radii, elevation, materials

### 7.1 Spacing
`--k-space-`: 1 = 4, 2 = 8, 3 = 12, 4 = 16, 5 = 20, 6 = 24, 8 = 32, 10 = 40, 12 = 48, 16 = 64. No other values, including gaps between bands in §18.

One distance is not a gap in the flow and is not a token: the space between the last band at rest and **floating chrome** (tab capsule, bill bar), whose position is fixed by the safe area. That distance must be ≥ 8, and content below it scrolls under the chrome (§18.1, §18.11).

### 7.2 Grid

| Class | Width (CSS px) | Margins | Columns | Gap |
| --- | --- | --- | --- | --- |
| compact | < 600 | 16 (< 402 wide), 20 (≥ 402) | 4 | 12 |
| medium | 600 to 1023 | 24 | 8 | 16 |
| expanded | 1024 to 1439 | 24 | 12 | 16 |
| wide | ≥ 1440 | 32, content max 1200 | 12 | 24 |
| kitchen (KDS, any width) | full width | 24 | lanes (§18.7) | 16 |

Anything that floats over the grid (the tab capsule, the bill bar, toasts) uses the same side margin as the grid beneath it. The kitchen row is its own class because the wall never scrolls and every pixel of width holds tickets (§13.6); a content max would waste a third of a 1920 screen.

### 7.3 Radii
- `--k-r-1` 8: qty boxes, icon squares in rows.
- `--k-r-2` 12: fields, the selection lens in the sidebar **and the rail**, the selected row, banners, **cash keypad keys**.
- `--k-r-3` 20: cards, tiles, tickets, list groups.
- `--k-r-4` 28: sheet top corners, dialogs.
- **Capsule** = `min-height / 2`: buttons, tracks, chips, toasts, badges, the tab capsule (31 at 62).
- **Circle:** PIN keys, avatars, icon buttons.
- Nested radius = outer minus padding, floored at 8.

### 7.4 Elevation

| Level | Light | Dark |
| --- | --- | --- |
| 1 · cards, lens | `0 1px 2px rgba(10,15,13,.06), 0 2px 8px rgba(10,15,13,.04)` | None. Separation by surface step |
| 2 · popover | Popover on surface-1: `0 4px 12px rgba(10,15,13,.08), 0 12px 32px rgba(10,15,13,.10)` | Popover on surface-3: `0 8px 24px rgba(0,0,0,.5)` |
| 2 · tab capsule, bill bar | Chrome, same shadow | Chrome, same shadow, plus a 1 px `--k-line` edge (decorative, so the capsule reads against a dark page whose shadow is invisible) |
| 2 · toast | Inverse, same shadow | Inverse with a 1 px line-strong edge, same shadow |
| 3 · sheet, dialog (only while open) | `0 -4px 16px rgba(10,15,13,.06), 0 -16px 48px rgba(10,15,13,.12)` | `0 -16px 48px rgba(0,0,0,.6)` on surface-1 |

A closed sheet is `visibility:hidden` and casts no shadow.

### 7.5 Materials
- **Where:** only chrome over scrolling content: the tab capsule, the compact nav bar after scroll, and a sheet header while its body scrolls.
- **Recipe:** `--k-chrome` with `-webkit-backdrop-filter` and `backdrop-filter: blur(24px) saturate(180%)`.
- **At most 2 blurred layers.** Priority: sheet header, then tab capsule, then nav bar. Under an open sheet, the page's chrome renders solid surface-1, because it is under the scrim.
- **Never** on the KDS, cards or tiles, and never animated in size.
- **Reduce Transparency** (§16): all chrome becomes solid surface-1 with a hairline.
- **Cost:** recorded in the round evidence against §19, not claimed.

---

## 8. Iconography

- **Set:** Material Symbols **Outlined**, grade 0.

| Setting | Value |
| --- | --- |
| Fill | **0 everywhere** (revision 7, P11). Selection is never carried by the icon's fill: the selected tab, rail and sidebar item take the lens paint, the icon in accent-ink and the label in ink-1 at 600 (500 at rest) |
| Weight | 400; 500 on the KDS at 32 px |
| Optical size | Matches render size: 20 at 20 px, 24 at 24 px, 40 at 32 and 40 px |
| Sizes | 16 (inline with 13 px text), 20 (buttons, rows, chips), 24 (nav, toolbars, PIN delete), 32 (KDS), 40 (empty states, inside a 72 circle) |

- **Files.** Today `assets/icons/material/<name>.svg` holds the Outlined `default/24px.svg` only (README). Variants are fetched from the same gstatic path the README uses, `…/materialsymbolsoutlined/<name>/<style>/<size>px.svg`, and saved as **`<name>.<style>.<size>.svg`**:
  - `<style>` is the gstatic folder: `default` and `wght500` (no `fill1` variant is used, so none is vendored);
  - `<size>` is the optical size: `20`, `24`, `40`;
  - so the KDS's weight 500 at optical size 40 is `error.wght500.40.svg`, and the selected tab icon is the same `dashboard.svg` as at rest;
  - the existing `<name>.svg` stays as the name for `default` at 24.

  The README's 404 rule applies to each variant URL. If a variant 404s, the icon uses `default` at the nearest size.
- **Sprite:** `tools/build-icon-sprite.js` generates `assets/icons/material/sprite.<surface>.svg` holding only the symbols a surface uses. The shell references it with a `?v=` stamp, and it is precached (§21.3).
- **Element:** `<k-icon name size [fill] [mirror]>` references `#name` and sets `fill="currentColor"`. Icon-only buttons carry a keyed `aria-label`.
- **Only vendored names.** Every icon this spec names exists today in `assets/icons/material/` at `31c94529` (revision 6 replaced the eight that did not: `calendar_today` by `today`, `hourglass_bottom` by `timer`, `priority_high` by `error`, `view_list` by `list`, `cloud_off` by `wifi_off`, `cloud_upload` by `upload`, `cloud_done` by `task_alt`, `delivery_dining` by `two_wheeler`; the home tab uses `dashboard`, takeaway uses `shopping_bag`, waiting uses `schedule`). No web font, no Google Fonts link, no runtime fetch. `tools/icon-vendored-test.mjs` (wired into `check.js`) fails when a kit file or sprite names an icon whose `<name>.svg` is absent. The weight and fill variants above are added with the README's one-line command at stage 1, in a commit of their own; until a variant is checked in, the icon renders as `default` 24, which is the state the test accepts.
- **How a symbol is referenced (the revision 5 preview bug).** Each `<symbol>` keeps Material's `viewBox="0 -960 960 960"`. The referencing element is `<svg width="1em" height="1em" aria-hidden="true"><use href="#name" width="100%" height="100%"/></svg>` and carries **no** `viewBox` of its own. With a second `viewBox` on the outer `<svg>`, the `<use>` is laid out at y 0 to 960 inside a view that spans y -960 to 0, so the glyph paints off-canvas and the icon is an empty box. `tools/icon-render-test.mjs` loads the kit gallery and the preview and fails when any `k-icon` (or preview icon) has a `<use>` whose client rect does not intersect its `<svg>`'s rect with an area above zero.
- **Deleted:**
  - `MENU_ART` and the 17 `art()` factories (tiles show the merchant photo or text);
  - Lucide;
  - `SLIDERS_SVG` (becomes `tune`);
  - the KDS eye;
  - the stroke-rounding hack (`tokens.css:255-259`, deleted at stage 7).
- **Mirroring:** §9.5.

---

## 9. Language

### 9.1 Glossary (one name per thing)

| Concept | EN | FR | AR |
| --- | --- | --- | --- |
| Collect money for a bill | Charge (the button: "Charge 230.00 MAD") | Encaisser | حصّل |
| Send unsent lines to the kitchen | Send to kitchen | Envoyer en cuisine | إرسال إلى المطبخ |
| Take a line off before it is sent | Remove | Retirer | إزالة |
| Take a line off after it is sent | Void | Annuler l'article | إلغاء الصنف |
| Reverse a whole paid sale | Cancel sale | Annuler la vente | إلغاء البيع |
| Return money from a paid sale | Refund | Rembourser | استرداد |
| Close an open, unpaid table | Cancel table | Annuler la table | إلغاء الطاولة |
| Give a finished order to the customer | Hand over | Remettre | تسليم |
| Change cashier mid-shift | Shift change | Relève de caisse | تبديل الوردية |
| Cash in the drawer at opening | Opening float | Fond de caisse | رصيد الافتتاح |
| Money the guest adds for the staff | Tip | Pourboire | البقشيش |
| Reverse the last change (the toast's action) | Undo | Restaurer | تراجع |
| Counting the drawer | Cash count | Comptage de caisse | عدّ النقد |
| End-of-day closure, named as an act (in a sentence, and in `act.close_till`; revision 18, M5) | Closing the till | La clôture de la caisse | إغلاق الصندوق |
| End-of-day closure, its button (`count.close`; an imperative, the same verb) | Close the till | Clôturer la caisse | أغلق الصندوق |
| A code that lets an act go ahead (revision 18, M5: one word in FR for both levels) | Approval | Autorisation | موافقة |
| The document that closure produces | Z report | Rapport Z | تقرير Z |
| What the customer pays from (revision 15, P8: bare الحساب means only this; الفاتورة is not used) | Bill | Addition | الحساب |
| The merchant's sign-in to Kiwi, an e-mail and a password (revision 15, P8) | Account | Compte | حساب Kiwi (always with "Kiwi", so it never reads as a bill) |
| A recorded sale | Order | Commande | طلب |
| The kitchen's slip | Kitchen ticket | Bon cuisine | تذكرة المطبخ |
| The customer's paper | Receipt | Ticket de caisse | إيصال |
| A person who buys | Customer | Client | زبون |
| Customer status (exactly one per customer) | Regular · New · Inactive | Habitué · Nouveau · Inactif | دائم · جديد · غير نشط |
| Customer VIP, the marker on top of a status and the segment (revision 24, P5: Arabic is VIP for both, not the shipped كبار and كبير, §22) | VIP | VIP | VIP |
| Each person's 4-digit code (till lock, dashboard lock, team app sign-in) | Personal code | Code personnel | الرمز الشخصي |
| The store's names and roles that a till loads to draw its staff pad; it holds no code, `functions/api/config.js:11` (revision 15, M2) | Staff list | Liste du personnel | قائمة الموظفين |
| The 6-digit code the till shows for clocking in | Attendance code | Code de pointage | رمز الحضور |
| Device pairing code (6 digits, 15 min) | Pairing code | Code d'appairage | رمز الربط |
| A device linked to a store (revision 10, P4: one word per language in every string) | Paired, pair | Appairé, appairer | مربوط، اربط |
| The merchant's business, in till and access copy (revision 10, P4; one of a merchant's several places stays a venue, établissement, as in `nav.venue`) | Store | Commerce | المتجر |
| Printer bridge code (6 digits, typed into the bridge app) | Printer code | Code imprimante | رمز الطابعة |
| The store's day, from its cutoff to the next | Business day | Journée | يوم العمل |
| Range presets | Today · Yesterday · 7 days · 30 days | Aujourd'hui · Hier · 7 jours · 30 jours | اليوم · أمس · 7 أيام · 30 يومًا |
| "7 days" means | today and the 6 business days before it | aujourd'hui et les 6 journées précédentes | اليوم والأيام الستة السابقة |
| Demo marking | Demo data | Données de démo | بيانات تجريبية |

**"Charge" is the term (revision 6, one ruling):** it names the act of taking a bill's money in English, on `bill.take_payment` "Charge 230.00 MAD" and `split.pay_share` "Charge share 1"; FR "Encaisser", AR "حصّل". Revision 5 also listed it as retired, which contradicted the row above; it is not retired.

Retired names: "Take payment" (revision 4's button), "Dormant", "Visiting less often", "Remise" (for hand over), "Passation", "Kiwi Team", "End of shift", "owner code", "account code", "Last 7 days", "Drawer open".

### 9.2 Plurals
- Strings use ICU MessageFormat plural syntax and are resolved with `Intl.PluralRules` (Safari 13+).
- Every counted string has all the categories its locale uses:
  - EN: one, other;
  - FR: one (0 and 1), many (whole millions, e.g. 1 000 000), other;
  - AR: zero, one, two, few, many, other.
- **AR categories follow CLDR, which tests `n % 100`:** zero is 0; one is 1; two is 2; few is `n % 100` in 3 to 10 (3 to 10, 103 to 110, …); many is `n % 100` in 11 to 99 (11 to 99, 111 to 199, …); other is everything else (100, 101, 102, 200, …). `strings-completeness-test` fails a missing category, and the plural unit test checks 0, 1, 2, 3, 10, 11, 99, 100, 101, 102, 103 and 111 in every counted AR string.

Example, `customers.known`:

| Locale | Forms |
| --- | --- |
| EN | one `# known customer` · other `# known customers` |
| FR | one `# client connu` · many and other `# clients connus` |
| AR | zero `لا زبناء معروفون` · one `زبون معروف واحد` · two `زبونان معروفان` · few `# زبناء معروفين` · many `# زبونًا معروفًا` · other `# زبون معروف` |

**Every Arabic count string carries all six forms (revision 6).** Revision 5 listed only some of them in §9.6's cells (`floor.seats` had no dual, `orders.summary` and `ai.today_*` had only few and many). The §9.6 Arabic cell of a plural key shows its `other` form; **its six forms are this table's row for the noun it counts**, in the case the sentence puts it in. Nominative is the noun as subject or standing alone; after a preposition or as the second term of a construct (من, من أصل, إرسال) the dual takes its genitive ending; the `many` form (accusative of specification) is the same in both.

| Noun (keys that count it, case) | zero | one | two (nominative / after a preposition) | few (3 to 10) | many (11 to 99) | other (100, 101, …) |
| --- | --- | --- | --- | --- | --- | --- |
| order: `orders.summary` (nom.); `ai.today_down`, `ai.today_up`, `ai.today_same` (after من) | لا طلبات | طلب واحد | طلبان / طلبين | {n} طلبات | {n} طلبًا | {n} طلب |
| item: `bill.view_a11y`, `kds.items`, `kds.compressed` (nom.) | لا أصناف | صنف واحد | صنفان / صنفين | {n} أصناف | {n} صنفًا | {n} صنف |
| sale: `sync.waiting`, `sync.blocked` (nom.); `sync.sending` (after إرسال) | لا عمليات بيع | عملية بيع واحدة | عمليتا بيع / عمليتي بيع | {n} عمليات بيع | {n} عملية بيع | {n} عملية بيع |
| guest: `bill.meta` (nom.) | لا ضيوف | ضيف واحد | ضيفان / ضيفين | {n} ضيوف | {n} ضيفًا | {n} ضيف |
| customer: `customers.known` (nom., with its adjective, example above); `home.returning_a11y` (after من أصل) | لا زبناء | زبون واحد | زبونان / زبونين | {n} زبناء | {n} زبونًا | {n} زبون |
| new (adjective): `badge.new` (nom.) | لا جديد | واحد جديد | اثنان جديدان | {n} جديدة | {n} جديدًا | {n} جديد |

**Invariant count strings** put the number where no noun agrees with it, so one form serves every category, and they say so in their key's note: `stepper.only_left` ("تبقّى {n} فقط"), `split.unassigned` ("أصناف بلا حصة: {n}") and `home.see_all_orders` ("اعرض كل الطلبات ({n})"). `strings-completeness-test` reads this table: every AR plural key must either map to a noun row (and then the bundle must hold all six forms, the dual in the stated case) or be on the invariant list. The fixture's two-seat tables (T3, T11, T20, T21, T23) render "مقعدان". Where a verb or adjective follows the counted noun, it agrees with the form: `sync.blocked` dual is "عمليتا بيع لم تُقبلا", `customers.known` dual is "زبونان معروفان"; the bundle holds each full sentence per category, the table only fixes the noun.

### 9.3 Fallback and delivery
- `t(key)` looks up the current locale, then EN. **FR is never a fallback for EN or AR.**
- A key missing from EN fails the build (`strings-completeness-test`), so it cannot reach a merchant.
- An AR string missing at runtime shows EN and logs the key.
- **Bundles are per surface and per locale:** `assets/kit/strings/<surface>.<lang>.js` for `kit` (shared component strings), `dashboard`, `till`, `kds`, `team`, `ordering` and `onboarding`. A page loads `kit.<lang>` plus its own surface bundle, each through a `<script src="…?v=N">` tag in the shell (never a URL built at runtime), so `bump-stamp` sees every one (§21.3).
- The shell precaches the bundles of all three locales in the SW `SHELL`, bumped in the same `bump-stamp` run as the kit. Stale-while-revalidate can therefore never pair a new kit with old strings.
- `strings-sw-test` asserts that every kit file and every strings file share one generation.

### 9.4 Copy voice
**Rules:**
- **Every button label starts with a verb** ("Enter amount", "Set up later", "Mark ready", "Charge 230.00 MAD"). The amount sits on the button that starts a payment (`bill.take_payment`, `split.pay_share`) and on `discount.apply`; a confirm inside the payment pane ("Confirm cash payment") does not repeat it, because the key figure directly above it shows it and the repeat pushed the label onto two lines (§6.6). Exceptions are fixed system labels ("Done", "Back", "Undo"), the chip labels of §10.25, and the **quick-value chips** whose label is the value itself: `pay.exact` and the amount chips, the tip options (§10.26), and `count.same_as_last` "Last float · 500.00 MAD"; each of these has a verb-first accessible name (`pay.exact_a11y`, `count.same_as_last_a11y`). **A placeholder that opens a label** (FR `{weekday} dernier à {time}`) is capitalised by `t()` with `toLocaleUpperCase` on its first letter, a string operation; CSS `text-transform` stays banned (§6.2).
- Sentence case. No exclamation marks.
- Full stops in sentences; the middle dot only between metadata.
- Name the baseline.
- No marketing on a work surface.
- Errors say what happened, then what to do.
- FR uses "vous".
- AR is Modern Standard Arabic with Maghrebi trade words and Latin digits.

| # | Before (finding) | EN | FR | AR |
| --- | --- | --- | --- | --- |
| 1 | "Discount · heure inconnue" (Remise mistranslated) | Handed over · time not recorded | Remise au client · heure non enregistrée | سُلِّمت للزبون · الوقت غير مسجّل |
| 2 | "−1,127 MAD · −5.6 % vs yest." | −1,127 MAD (−5.6%) vs yesterday at 17:39 | −1 127 MAD (−5,6 %) par rapport à hier à 17:39 | −1 127 درهم (−5,6 %) مقارنةً بالأمس عند 17:39 |
| 3 | "Cancel a sale" opens "Réimprimer un ticket" | Cancel sale · Choose the sale to cancel | Annuler la vente · Choisissez la vente à annuler | إلغاء البيع · اختر عملية البيع التي تريد إلغاءها |
| 4 | "Paused · 8 min" in alarm red | On break · 8 min (ink-2) | En pause · 8 min | في استراحة · 8 د |
| 5 | "36 of 137 customers seen +26 %" | 3 of 8 known customers came back today (`home.returning_a11y`, plural) | 3 clients connus sur 8 sont revenus aujourd'hui | عاد اليوم 3 من أصل 8 زبناء معروفين |
| 6 | "This email already has an account · sign in instead." | This e-mail already has an account. Sign in instead. | Cet e-mail a déjà un compte. Connectez-vous. | هذا البريد مرتبط بحساب Kiwi. سجّل الدخول بدلاً من ذلك. |
| 7 | KDS "Accepter" on the English board | Start | Commencer | ابدأ |
| 8 | Void copy promising a card refund Kiwi cannot make | Sale cancelled in Kiwi. Refund the card on your terminal. | Vente annulée dans Kiwi. Remboursez la carte sur votre terminal. | أُلغي البيع في Kiwi. استرجع المبلغ للبطاقة من جهاز الدفع. |

In the Arabic examples the numbers render inside `<bdi>`.

### 9.5 Mirroring (AR, `dir="rtl"`)

| Element | In RTL |
| --- | --- |
| Rail, sidebar, bill pane, split views | Mirrored: rail and sidebar on the right, bill pane on the left |
| Push transitions, swipe-back edge | Mirrored: incoming from the left, back from the right edge |
| Row swipe actions | Revealed from the left edge |
| `chevron_left` / `chevron_right`, `arrow_back` / `arrow_forward`, `send`, `backspace`, `undo`, `redo`, `logout`, `open_in_new`, `reply` | Mirrored (`<k-icon mirror>`, `scaleX(-1)`) |
| `arrow_upward` / `arrow_downward`, `check`, `close`, `add`, `remove`, `search`, `schedule`, `timer`, `error`, `warning`, media, charts, brand marks | Not mirrored |
| Numbers, amounts, codes, times, phone numbers | LTR inside `<bdi>` |
| PIN pad and cash keypad | `direction: ltr` grid, 1 2 3 left to right, as on the iOS Arabic keypad |
| Stepper | Mirrored: − on the start side (right), + on the end side (left) |
| Chart time axis | Mirrored: the business day starts at the right |
| Progress bars, sliders, the onboarding step bar | Mirrored |
| Liquid lens stretch | Follows the visual direction |
| Phone tab order | Mirrored: Home at the right |
| KDS lanes | Mirrored: New on the right, columns fill right to left, oldest at top-right |
| Floor plan | Kept as shipped (§18.4); this direction does not change it |
| Bottom sheets, toasts | Unchanged |

### 9.6 String table (every new string in this direction)

Keys are grouped by bundle (§9.3). `{…}` are ICU arguments; amounts, percentages and times are formatted by `KiwiFormat` (§6.3) and wrapped in `<bdi>` in AR, so `{pct}` reads "10%" in EN and "10 %" in FR and AR. Counted strings marked "plural" carry the full category set of §9.2; the table shows EN `other`, FR `other` and AR `other`, and the AR `one`, `two`, `few` and `many` forms are given where the noun changes.

**Coverage rule.** Every user-visible string in §10 to §18 is either a key below or **fixture data** (names, dish names, table numbers, amounts and times from the worked example, §18.0). `strings-coverage-test` greps the spec's quoted UI strings in §10 to §18 against this table and the fixture, and fails on a string that is neither.

**String lints (revision 15).** `strings-lint` runs in `check.js` over every value in `strings/*.json`, in all three languages; this table is its seed, and the script that generates the counts below ran each rule over this table for revision 15. Every rule passes today, and each fails on revision 14's table (55 findings, which is how the rules were checked).

| Lint | Fails when | Why |
| --- | --- | --- |
| No code travels to the till (revision 15, M2; rationale corrected in revisions 16 and 17, M1 and M2) | In any value (revision 21: the clause on `lock.roster.*` went with the roster step, §10.26), one sentence holds both the personal-code term (EN "personal", "staff" or "team code"; FR "code personnel", "code du personnel", "code d'équipe"; AR الرمز الشخصي, الرموز الشخصية, رموز الفريق) and a verb that would put codes on the device (EN send, load, download, stored, save, keep, hold, copy; FR envoy-, charg-, télécharg-, stock-, enregistr-, gard-, conserv-, copi-; AR أرسل, يرسل, تحميل, يحمّل, تنزيل, خزّن, حفظ, يحفظ, يحتفظ) | No code is ever sent to a till. The roster a till loads is names and roles (`functions/api/config.js:11`); online, the server compares the typed code (`functions/auth/_lib.js`, `functions/api/employee.js`); and the till keeps, per store, only a salted SHA-256 verifier of each code proven online on it, for 7 days and at most 12 rows, against which it compares a code typed offline (`assets/caisse-pairing.js:50-100`, §10.2). **Two premises this rule once rested on were false, and both are corrected:** revision 15 said codes are compared on the server only, which the till's verifier contradicts (round 16, M1); revision 16 said the dashboard asks the server only, while the onboarding browser keeps every code typed there in plaintext (`kiwiPins`) and compares them itself (round 17, M2; §10.2's dashboard block). So the rule holds the copy to the design, in which no device keeps a code, and no string claims that a device holds none. Revision 14's `lock.roster.server_error` said Kiwi had not sent the store's personal codes. A second rule follows: `pin.offline`, which says the code can only be checked online, is used only where no offline check applies (§10.2's use list, which `strings-lint` reads) |
| No narrow no-break space (M3, P7) | Any value, any `KiwiFormat` output or the fixture holds U+202F | Neither shipped file has the glyph (§6.1), so it would be set in a system face (§6.3) |
| French high punctuation (P7) | In FR, `?`, `!`, `;`, `:` or `»` follows anything but U+00A0, or `«` is followed by anything but U+00A0. A digit before `:` (a time, 17:39), `://` and an ICU plural selector (`one:`) are exempt | French puts a non-breaking space there. U+00A0 is the one the shipped file has, and in Inter Tight it is 480/2048 em, the same advance as U+0020, so no width in §6.6 moves. The thin U+202F that some French house styles put before `? ; ! »` is not shipped (the row above), so U+00A0 is used before all five. Revision 15 changed 24 rows: `pin.paused.owner_hint`, `pin.offline`, `printer.code.unpaired`, `attendance.unpaired`, `split.progress`, `sync.storage_error`, `lock.store.why`, `lock.store.why_body`, `lock.store.why_body_unpaired`, `void.kds`, `floor.occupied`, `chart.summary_down`, `_up`, `_same`, `_none`, `ai.suggest.compare`, `.reorder`, `.best_after`, `settings.lift_pause_body`, `ob.forgot`, `ob.forgot.title`, `ob.forgot.no_mail_body`, `ob.kind`, `prep_perm_denied` |
| Bill and account (P8) | In AR, الفاتورة appears; a word built on حساب is not followed by " Kiwi" and its row's EN value does not say "bill"; or an EN value says "account" and its AR value lacks حساب Kiwi or its FR value lacks "compte" | الحساب is the glossary's bill (§9.1), and an account is always حساب Kiwi. Revision 15 changed `pay.not_recorded` (الفاتورة), `printer.code.not_ready`, `settings.business`, `ob.create`, `ob.exists` (and §9.4's example 6), `ob.forgot.body`, `ob.forgot.no_mail_body`, `ob.kds_warning`, `ob.team_warning`, and `ai.unknown_costs`, where حساب meant "work out" and is now معرفة |
| Act phrases (revision 18, M5) | A value holding `{act}` does not start with it in EN or FR, or in AR does not hold it directly after يتطلب; an `act.*` EN value does not start with a capital and a gerund ("-ing"), "The" or "A"; an `act.*` FR value does not start with Le, La, L', Un or Une; an `act.*` AR value starts with the AR of a button key (an imperative), or, where the glossary names the act, does not start with the glossary's AR term (`act.close_till` and إغلاق الصندوق, `act.cancel_table` and إلغاء الطاولة, `act.cancel_sale` and إلغاء البيع, `act.refund` and استرداد, `act.shift_change` and تبديل الوردية); and the glossary's two closure rows disagree with `act.close_till` and `count.close` | `{act}` is the subject of each sentence it fills. An imperative there (أغلق الصندوق) makes the Arabic ungrammatical; a verbal noun (إغلاق الصندوق) reads "Closing the till needs…". One FR word, Autorisation, names an approval at both levels, as the shipped modal does |
| Act reachability (revision 24, M1) | An `act.*` key has no row in §12's table "Where each act starts", or the entry key its row names is not in this table. The table is seeded into `strings/act-entries.json`, which `strings-lint` reads beside the bundles | An act with a manager approval, an offline row and copy but no button is a removal by omission: round 24 found `act.open_drawer` with all three and no entry |

**Every interpolation is isolated (revision 15, P6).** A name or a number put into a sentence of the other direction can pull the sentence's punctuation and digits across it: a Latin store name at the end of an Arabic sentence carries the full stop to the wrong side, and an Arabic name inside an English sentence does the same to a number after it.
- **In the DOM,** `KiwiStrings.format(key, args)` returns nodes, never a string, and puts each argument in its own `<bdi>`: a number or an amount in `<bdi dir="ltr">` (§6.3), and a name in `<bdi>`, whose direction comes from its own first strong character.
- **In plain text,** where no element can exist (an `aria-label`, a `title`, a clipboard copy), each argument is wrapped in U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE instead. These two are added at that boundary only: no value in `strings/*.json` holds them, and no text node does, so `font-coverage-test` never meets them (§6.3).
- **Act vectors (revision 21, M6).** `strings-bidi-test` also renders the two discount acts and compares their text, with ⍽ for U+00A0: a 10 % remise gives EN `A 10% discount`, FR `Une remise de 10⍽%`, AR `تطبيق خصم بنسبة 10⍽%`; a 20 MAD remise gives EN `A 20.00⍽MAD discount`, FR `Une remise de 20,00⍽MAD`, AR `تطبيق خصم بقيمة 20,00⍽درهم`, with the argument inside its `<bdi>` in AR.
- **`strings-bidi-test`** renders every key that has an argument, in all three languages, with a Latin name ("Café Atlas 2") in the Arabic sentences and an Arabic one ("مقهى الأطلس") in the English and French ones. It fails when an argument's text is outside a `<bdi>` in the DOM, or outside an FSI and PDI pair in an attribute, and when a value in the bundles holds U+2066 to U+2069, U+200E, U+200F or U+061C.

**Shared (`kit`)**

| Key | EN | FR | AR |
| --- | --- | --- | --- |
| `action.try_again` | Try again | Réessayer | حاول مرة أخرى |
| `action.back` | Back | Retour | رجوع |
| `action.done` | Done | Terminé | تم |
| `action.undo` (revision 6: FR no longer "Annuler", which names three cancels, §9.1) | Undo | Restaurer | تراجع |
| `action.continue` | Continue | Continuer | متابعة |
| `action.next` | Next | Suivant | التالي |
| `action.close` (aria) | Close | Fermer | إغلاق |
| `state.loading` | Loading | Chargement | جارٍ التحميل |
| `state.updated` | Updated {time} | Mis à jour à {time} | حُدّث عند {time} |
| `state.offline` | Offline | Hors ligne | غير متصل |
| `state.demo` | Demo data | Données de démo | بيانات تجريبية |
| `switch.save_failed` | Couldn't save. The setting is back as it was. | Échec de l'enregistrement. Le réglage est revenu à l'état précédent. | تعذّر الحفظ. عاد الإعداد كما كان. |
| `stepper.only_left` (plural; AR invariant, §9.2) | Only {n} left | Plus que {n} | تبقّى {n} فقط |
| `stepper.decrease` | Decrease, {label} | Diminuer, {label} | إنقاص، {label} |
| `stepper.increase` | Increase, {label} | Augmenter, {label} | زيادة، {label} |
| `stepper.value` | {label}, now {n}. Tap to type a number. | {label}, actuellement {n}. Touchez pour saisir un nombre. | {label}، الآن {n}. المس لكتابة رقم. |
| `field.clear` | Clear | Effacer | مسح |
| `reason.choose` | Choose a reason | Choisissez un motif | اختر سببًا |
| `reason.other` | Other | Autre | أخرى |
| `action.more` (aria) | More actions | Plus d'actions | إجراءات أخرى |
| `action.clear_filter` | Clear filter | Effacer le filtre | امسح عامل التصفية |
| `action.sign_in` | Sign in | Se connecter | سجّل الدخول |
| `state.load_failed` | Couldn't load | Chargement impossible | تعذّر التحميل |
| `state.offline_title` | You're offline | Vous êtes hors ligne | أنت غير متصل |
| `state.offline_body` | Kiwi tries again as soon as you're back online. | Kiwi réessaie dès le retour de la connexion. | يعيد Kiwi المحاولة فور عودة الاتصال. |
| `state.checking` (reduced motion) | Checking | Vérification | جارٍ التحقق |
| `badge.new` (plural, aria; AR six forms: §9.2, new; the cell shows the "other" form like every plural cell, revision 8, F9) | {label}, {n} new | {label}, {n} nouveaux | {label}، {n} جديد |
| `access.suspended` (revision 11, P7: "store", as the glossary fixes for access copy) | This store's Kiwi access is paused. Ask the owner. | L'accès Kiwi de ce commerce est suspendu. Contactez le propriétaire. | وصول هذا المتجر إلى Kiwi موقوف. تواصل مع المالك. |
| `access.subscription` | The Kiwi subscription needs attention. Ask the owner. | L'abonnement Kiwi demande une action. Contactez le propriétaire. | اشتراك Kiwi يحتاج إلى إجراء. تواصل مع المالك. |
| `access.unavailable` | Kiwi can't check this right now. Try again in a moment. | Kiwi ne peut pas vérifier pour l'instant. Réessayez dans un instant. | لا يستطيع Kiwi التحقق الآن. حاول بعد لحظات. |

**Locks and codes (`kit`)**

| Key | EN | FR | AR |
| --- | --- | --- | --- |
| `pin.title` | Enter your code | Saisissez votre code | أدخل رمزك |
| `pin.sub.personal` | Your 4-digit personal code | Votre code personnel à 4 chiffres | رمزك الشخصي المكوّن من 4 أرقام |
| `pin.sub.pairing` | The 6-digit code shown in your dashboard | Le code à 6 chiffres affiché dans votre tableau de bord | الرمز المكوّن من 6 أرقام الظاهر في لوحة التحكم |
| `pin.progress` | {n} of {total} entered | {n} sur {total} saisis | أُدخل {n} من {total} |
| `pin.checking` | Checking | Vérification | جارٍ التحقق |
| `pin.wrong` | That code didn't work. Try again. | Ce code ne fonctionne pas. Réessayez. | هذا الرمز غير صحيح. حاول مرة أخرى. |
| `pin.paused.store` | Every code on this store's tills is paused for {minutes} min after too many wrong tries. | Tous les codes des caisses de ce commerce sont en pause pendant {minutes} min après trop d'essais incorrects. | جميع الرموز على صناديق هذا المتجر متوقفة لمدة {minutes} د بعد محاولات خاطئة كثيرة. |
| `pin.paused.owner_hint` (**shown only once `POST /api/pin/unlock` ships**, §23.8; until then the pad shows `pin.paused.store` alone) | The owner can lift the pause from the dashboard: Settings › Devices. | Le propriétaire peut lever la pause depuis le tableau de bord : Réglages › Appareils. | يمكن للمالك رفع الإيقاف من لوحة التحكم: الإعدادات › الأجهزة. |
| `pin.paused.self` | Too many tries. Try again in {minutes} min. | Trop d'essais. Réessayez dans {minutes} min. | محاولات كثيرة. حاول بعد {minutes} د. |
| `pin.offline` (revision 16, M1; revision 19, M4: only the team sign-in and clock-in, the two uses that retry by themselves, §10.2; never a pairing pad, the dashboard lock, the till lock or either approval) | No connection. This code can only be checked online. It will be checked when the connection is back. | Pas de connexion. Ce code ne peut être vérifié qu'en ligne. Il le sera au retour de la connexion. | لا يوجد اتصال. لا يمكن التحقق من هذا الرمز إلا عبر الإنترنت. سيتم التحقق منه عند عودة الاتصال. |
| `pin.offline_unknown` (revision 16, M1; revision 17, P1: the till lock and both approvals, offline, when the typed code matches none of the till's verifier rows, §10.2. It says only what the till knows: a code used here recently can have no row, evicted by the 12-row cap) | No connection. This code can't be checked offline on this till. Try again when the connection is back. | Pas de connexion. Ce code ne peut pas être vérifié hors ligne sur cette caisse. Réessayez quand la connexion revient. | لا يوجد اتصال. لا يمكن التحقق من هذا الرمز دون اتصال على هذا الصندوق. حاول مجددًا عند عودة الاتصال. |
| `pin.dashboard.offline_unknown` (revision 19: the dashboard lock, offline, when no row of this browser matches the typed code on a configured account, §10.2) | No connection. This code can't be checked offline on this device. Try again when the connection is back. | Pas de connexion. Ce code ne peut pas être vérifié hors ligne sur cet appareil. Réessayez quand la connexion revient. | لا يوجد اتصال. لا يمكن التحقق من هذا الرمز دون اتصال على هذا الجهاز. حاول مجددًا عند عودة الاتصال. |
| `pin.dashboard.no_owner_code` (revision 21, M3: the dashboard lock's help line when no code above the staff tier is known, §10.2; not a refusal. Shipped as inline text saying "Connect with Kiwi", `dashboard.html@a8158aad:6089-6093`; this key changes it to "Contact Kiwi", the step the owner can take, and AR says حساب Kiwi for the account, as the bill-and-account lint requires) | No owner code is set up for this account. Contact Kiwi to set up your access code. | Aucun code propriétaire n'est configuré pour ce compte. Contactez Kiwi pour configurer votre code d'accès. | لا يوجد رمز مالك مضبوط لحساب Kiwi هذا. تواصل مع Kiwi لضبط رمز الدخول. |
| `pin.unavailable` | Code check unavailable. Try again in a moment. | Vérification des codes indisponible. Réessayez dans un instant. | التحقق من الرموز غير متاح. حاول بعد لحظات. |
| `pin.unpaired` (till lock and manager pad only) | This device is no longer paired with {venue}. Pair it again to unlock. | Cet appareil n'est plus appairé à {venue}. Appairez-le à nouveau pour déverrouiller. | لم يعد هذا الجهاز مربوطًا بالمتجر {venue}. اربطه من جديد لفتحه. |
| `pin.pair_till` | Pair this till | Appairer cette caisse | اربط هذا الصندوق |
| `pin.signed_out` | You're signed out. Sign in again to unlock. | Vous êtes déconnecté. Reconnectez-vous pour déverrouiller. | تم تسجيل خروجك. سجّل الدخول مجددًا لفتح القفل. |
| `pin.sign_in` | Sign in | Se connecter | سجّل الدخول |
| `pin.dashboard_locked` | {business} · Dashboard locked | {business} · Tableau de bord verrouillé | {business} · لوحة التحكم مقفلة |
| `pin.hello` | Hello, {name} | Bonjour, {name} | مرحبًا، {name} |
| `pin.delete` (aria) | Delete last digit | Effacer le dernier chiffre | احذف الرقم الأخير |
| `pin.face_id` (aria) | Unlock with Face ID | Déverrouiller avec Face ID | افتح باستخدام Face ID |
| `pin.not_till` (revision 17, M1: the till lock, when the code is right and its role does not open the till, online or from a verifier row; {name} is the first name, as in the shipped message, `caisse-pairing.js:773-774`) | {name}, this code doesn't open the till. | {name}, ce code n'ouvre pas la caisse. | {name}، هذا الرمز لا يفتح الصندوق. |
| `pin.not_till.unnamed` (revision 17, M1: the same, when the answer carries no name) | This code doesn't open the till. | Ce code n'ouvre pas la caisse. | هذا الرمز لا يفتح الصندوق. |
| `pin.till.title` (revision 17, M1: the till approval, §10.2) | Till approval | Autorisation caisse | موافقة الصندوق |
| `pin.till.sub` (revision 17, M1: names the three roles that open the till, `staff-roles.js:162`; revision 18, M5: `{act}` is an `act.*` value; revision 19: every till act but the shift change, which uses `pin.till.handover_sub`) | {act} needs the personal code of a cashier, a manager or the owner. | {act} nécessite le code personnel d'un caissier, d'un responsable ou du propriétaire. | يتطلب {act} الرمز الشخصي لأمين صندوق أو مسؤول أو للمالك. |
| `pin.till.not_till` (revision 17, M1: the till approval, when the code is right and its role does not open the till, online or from a verifier row) | This code can't approve till actions. Ask a cashier, a manager or the owner to enter theirs. | Ce code ne permet pas de valider une action de caisse. Demandez à un caissier, à un responsable ou au propriétaire de saisir le sien. | لا يمكن لهذا الرمز الموافقة على إجراءات الصندوق. اطلب من أمين صندوق أو مسؤول أو من المالك إدخال رمزه. |
| `pin.till.handover_sub` (revision 19, M2: the shift change's till approval, in place of `pin.till.sub`; only the incoming cashier may approve, `kiwi-caisse.html:18904-18907`) | {name} confirms with their personal code. | {name} confirme avec son code personnel. | التأكيد بالرمز الشخصي لـ{name}. |
| `pin.till.not_incoming` (revision 19, M2: the shift change, when the server proves a code that is not the incoming cashier's) | This is not {name}'s code. Confirming needs {name}'s personal code. | Ce n'est pas le code de {name}. La confirmation nécessite le code personnel de {name}. | هذا ليس رمز {name}. يتطلب التأكيد الرمز الشخصي لـ{name}. |
| `pin.manager.title` (revision 18, M5: FR "Autorisation", as the till level and the shipped modal) | Manager approval | Autorisation responsable | موافقة المسؤول |
| `pin.manager.sub` (revision 17, M1: the manager level only: the drawer without a sale, a discount, a refund, a stock adjustment, a sale cancellation; the till level uses `pin.till.sub`; revision 18, M5: `{act}` is an `act.*` value) | {act} needs a manager's personal code. | {act} nécessite le code personnel d'un responsable. | يتطلب {act} الرمز الشخصي لمسؤول. |
| `pin.manager.wrong` | That code didn't work. Too many wrong codes pause every code on this store's tills. | Ce code ne fonctionne pas. Trop de codes incorrects mettent en pause tous les codes des caisses de ce commerce. | هذا الرمز غير صحيح. كثرة الرموز الخاطئة توقف جميع رموز صناديق هذا المتجر. |
| `pin.manager.not_manager` | This code isn't a manager's. Ask a manager to enter theirs. | Ce code n'est pas celui d'un responsable. Demandez à un responsable de saisir le sien. | هذا ليس رمز مسؤول. اطلب من مسؤول إدخال رمزه. |
| `pin.manager.offline` (revision 16, M1: offline, only for the acts the server must approve, a refund, a stock adjustment and a sale cancellation, §10.2) | Approval needs a connection. Nothing has changed. | L'autorisation nécessite une connexion. Rien n'a changé. | تتطلب الموافقة اتصالًا. لم يتغيّر شيء. |
| `pin.till.needs_connection` (revision 18, M2 and M3; revision 19, M1 and M3: the till approval for an act whose effect is a server write with no outbox, the till-approval table's Offline column, §10.2; shown before a code is typed when the till is offline, and after a request that throws, with Try again and never a retry by itself) | {act} needs a connection to check the code. Nothing has changed. | {act} nécessite une connexion pour vérifier le code. Rien n'a changé. | يتطلب {act} اتصالًا للتحقق من الرمز. لم يتغيّر شيء. |
| `pin.connection_back` (revision 18, M2: the same pad, when the connection returns; the keys are enabled again) | Connection is back. Enter the code. | La connexion est revenue. Saisissez le code. | عاد الاتصال. أدخل الرمز. |
| `act.clear_order` (revision 18, M5: every `act.*` value fills `{act}` at the head of `pin.till.sub`, `pin.manager.sub` and `pin.till.needs_connection`, so EN is a gerund or noun phrase, FR a noun phrase with its article, and AR a verbal noun, never an imperative) | Clearing the order | L'effacement de la commande | مسح الطلب |
| `act.cancel_order` | Cancelling order {order} | L'annulation de la commande {order} | إلغاء الطلب {order} |
| `act.cancel_table` | Cancelling table {table} | L'annulation de la table {table} | إلغاء الطاولة {table} |
| `act.close_till` | Closing the till | La clôture de la caisse | إغلاق الصندوق |
| `act.cash_in` | Putting {amount} into the drawer | L'entrée de {amount} en caisse | إدخال {amount} إلى الدرج |
| `act.cash_out` | Taking {amount} out of the drawer | La sortie de {amount} de la caisse | سحب {amount} من الدرج |
| `act.shift_change` | The shift change to {name} | La relève de caisse par {name} | تبديل الوردية إلى {name} |
| `act.untrack_order` | Removing order {order} from tracking | Le retrait de la commande {order} du suivi | إزالة الطلب {order} من المتابعة |
| `act.reject_online` | Rejecting online order {order} | Le refus de la commande en ligne {order} | رفض الطلب الإلكتروني {order} |
| `act.open_drawer` | Opening the drawer without a sale | L'ouverture du tiroir sans vente | فتح الدرج دون بيع |
| `act.discount.pct` (revision 21, M6: the till's remise has two kinds, `kind` `'pct'` or `'amount'`, `kiwi-caisse.html@31c94529:18049`, `:18110`, `:18169-18171`; the pad picks the key by kind. Revision 18's `act.discount` is this key, renamed) | A {pct} discount | Une remise de {pct} | تطبيق خصم بنسبة {pct} |
| `act.discount.amount` (revision 21, M6: a fixed-amount remise; `{amount}` is formatted by `KiwiFormat` like every amount, §9.6's opening rule) | A {amount} discount | Une remise de {amount} | تطبيق خصم بقيمة {amount} |
| `act.refund` | Refunding {amount} | Le remboursement de {amount} | استرداد {amount} |
| `act.stock_adjust` | Adjusting stock of {item} | L'ajustement du stock de {item} | تعديل مخزون {item} |
| `act.cancel_sale` | Cancelling sale {order} | L'annulation de la vente {order} | إلغاء البيع {order} |
| `pair.title` | Pair this screen | Appairer cet écran | اربط هذه الشاشة |
| `pair.invalid` | That code didn't work or has expired. Codes last 15 minutes. Create a new one in the dashboard. | Ce code ne fonctionne pas ou a expiré. Un code dure 15 minutes. Créez-en un nouveau dans le tableau de bord. | هذا الرمز غير صحيح أو انتهت صلاحيته. تدوم الرموز 15 دقيقة. أنشئ رمزًا جديدًا من لوحة التحكم. |
| `pair.no_answer` (revision 19, M4: pairing and the store lock, when a redeem got no answer; the code is never sent again by itself, §10.2) | No answer from Kiwi. Check the connection, then enter the code again. | Pas de réponse de Kiwi. Vérifiez la connexion, puis saisissez à nouveau le code. | لا رد من Kiwi. تحقق من الاتصال، ثم أدخل الرمز من جديد. |
| `pair.maybe_used` (revision 19, M4: a 422 to a code typed again after a redeem that got no answer; the first redeem may have spent it) | This code may already have been used on this device. Create a new one in the dashboard. | Ce code a peut-être déjà été utilisé sur cet appareil. Créez-en un nouveau dans le tableau de bord. | ربما استُخدم هذا الرمز من قبل على هذا الجهاز. أنشئ رمزًا جديدًا من لوحة التحكم. |
| `pair.paused` | Too many wrong codes from this network. Try again in {minutes} min. | Trop de codes incorrects depuis ce réseau. Réessayez dans {minutes} min. | رموز خاطئة كثيرة من هذه الشبكة. حاول بعد {minutes} د. |
| `printer.code.title` | Printer code | Code imprimante | رمز الطابعة |
| `printer.code.body` | Type this code in Kiwi Printer Bridge on the counter computer. It expires at {time}. | Saisissez ce code dans Kiwi Printer Bridge sur l'ordinateur du comptoir. Il expire à {time}. | اكتب هذا الرمز في Kiwi Printer Bridge على حاسوب المنضدة. تنتهي صلاحيته عند {time}. |
| `printer.code.new` | Create a new code | Créer un nouveau code | أنشئ رمزًا جديدًا |
| `printer.code.unpaired` (401 on the printer code, §10.35) | This till is no longer paired with {venue}, so it can't create a printer code. Pair it again first. | Cette caisse n'est plus appairée à {venue} : elle ne peut pas créer de code imprimante. Appairez-la d'abord. | لم يعد هذا الصندوق مربوطًا بالمتجر {venue}، لذا لا يمكنه إنشاء رمز للطابعة. اربطه أولًا. |
| `attendance.replace` (revision 6; replaces `attendance.new`) | Replace the code on every till | Remplacer le code sur toutes les caisses | استبدل الرمز في كل الصناديق |
| `attendance.replace_body` | The current code stops working on every till. Anyone typing it will need the new one. | Le code actuel ne fonctionnera plus sur aucune caisse. Il faudra saisir le nouveau. | سيتوقف الرمز الحالي عن العمل في كل الصناديق. يجب كتابة الرمز الجديد. |
| `attendance.replaces_notice` (until stage 4) | Opening this code replaced any code shown on your other tills. | L'ouverture de ce code a remplacé tout code affiché sur vos autres caisses. | فتح هذا الرمز استبدل أي رمز معروض على صناديقك الأخرى. |
| `attendance.changed` (announced) | The attendance code changed. | Le code de pointage a changé. | تغيّر رمز الحضور. |
| `attendance.unpaired` (403 `forbidden-merchant`, §10.34) | This till is no longer paired with {venue}, so it can't show an attendance code. Pair it again first. | Cette caisse n'est plus appairée à {venue} : elle ne peut pas afficher de code de pointage. Appairez-la d'abord. | لم يعد هذا الصندوق مربوطًا بالمتجر {venue}، لذا لا يمكنه عرض رمز الحضور. اربطه أولًا. |
| `printer.code.creating` | Creating a code | Création du code | جارٍ إنشاء الرمز |
| `printer.code.failed` | Couldn't create a printer code. Try again. | Impossible de créer un code imprimante. Réessayez. | تعذّر إنشاء رمز الطابعة. حاول مرة أخرى. |
| `printer.code.not_ready` (revision 15, P8: an account is حساب Kiwi) | Printing through the counter computer isn't set up for this account yet. Contact Kiwi support. | L'impression par l'ordinateur du comptoir n'est pas encore activée pour ce compte. Contactez le support Kiwi. | الطباعة عبر حاسوب المنضدة غير مفعّلة لحساب Kiwi هذا بعد. تواصل مع دعم Kiwi. |
| `printer.code.expired` | This code has expired. Create a new one. | Ce code a expiré. Créez-en un nouveau. | انتهت صلاحية هذا الرمز. أنشئ رمزًا جديدًا. |

**Team app (`team`)**

| Key | EN | FR | AR |
| --- | --- | --- | --- |
| `team.signin.title` | Sign in to the team app | Connexion à l'app équipe | تسجيل الدخول إلى تطبيق الفريق |
| `team.email.label` | Work e-mail | E-mail professionnel | البريد الإلكتروني للعمل |
| `team.signin.next` (step 1 primary) | Enter your code | Saisir votre code | أدخل رمزك |
| `team.email.reason` (disabled reason) | Enter your work e-mail to continue. | Saisissez votre e-mail professionnel pour continuer. | أدخل بريد العمل الإلكتروني للمتابعة. |
| `team.bad` | That e-mail and code don't match. Try again. | Cet e-mail et ce code ne correspondent pas. Réessayez. | البريد الإلكتروني والرمز غير متطابقين. حاول مرة أخرى. |
| `team.ambiguous` | This e-mail and code match more than one business. Ask your manager to change one of the codes. | Cet e-mail et ce code correspondent à plusieurs commerces. Demandez à votre responsable de modifier l'un des codes. | هذا البريد والرمز يطابقان أكثر من نشاط تجاري. اطلب من مسؤولك تغيير أحد الرموز. |
| `team.edit_email` | Change e-mail | Modifier l'e-mail | غيّر البريد الإلكتروني |
| `clock.in` | Clock in | Pointer l'arrivée | سجّل الحضور |
| `clock.out` | Clock out | Pointer le départ | سجّل الانصراف |
| `clock.code.title` | Enter the attendance code | Saisissez le code de pointage | أدخل رمز الحضور |
| `clock.code.sub` (revision 19, P7: the till renews the code before it expires, §10.34, so no fixed interval is promised) | Tap Attendance code on the till. The code changes every few minutes. | Touchez Code de pointage sur la caisse. Le code change au bout de quelques minutes. | اضغط على «رمز الحضور» في الصندوق. يتغير الرمز كل بضع دقائق. |
| `clock.invalid` | That code didn't work or has expired. Check the till and try again. | Ce code ne fonctionne pas ou a expiré. Vérifiez la caisse et réessayez. | هذا الرمز غير صحيح أو انتهت صلاحيته. تحقّق من الصندوق وحاول مجددًا. |
| `clock.code_expired` (revision 18, M7: clock-in or out, when 5 minutes have passed since the code was typed and the request has still not been answered, so the code has expired, `team/live.js:169`) | That code has expired. Enter the new code shown on the till. The time is recorded when a code is accepted. | Ce code a expiré. Saisissez le nouveau code affiché sur la caisse. L'heure est enregistrée quand un code est accepté. | انتهت صلاحية هذا الرمز. أدخل الرمز الجديد الظاهر على الصندوق. يُسجَّل الوقت عند قبول الرمز. |
| `clock.not_recorded` | Not recorded. Try again. | Non enregistré. Réessayez. | لم يُسجَّل. حاول مرة أخرى. |
| `clock.in_since` | Clocked in since {time} | Arrivée pointée à {time} | مسجّل الحضور منذ {time} |
| `clock.break_note` | Breaks are recorded at the till. | Les pauses s'enregistrent à la caisse. | تُسجَّل الاستراحات من الصندوق. |
| `team.session_ended` | Your session has ended. Sign in again to clock in. | Votre session a expiré. Reconnectez-vous pour pointer. | انتهت جلستك. سجّل الدخول مجددًا لتسجيل الحضور. |
| `team.sign_out` | Sign out of this device | Se déconnecter de cet appareil | سجّل الخروج من هذا الجهاز |
| `team.nav.tables` / `.menu` / `.alerts` / `.me` | Tables / Menu / Alerts / Me | Tables / Menu / Alertes / Moi | الطاولات / القائمة / التنبيهات / أنا |

**Till (`till`)**

| Key | EN | FR | AR |
| --- | --- | --- | --- |
| `menu.search` | Search the menu | Rechercher dans le menu | ابحث في القائمة |
| `menu.enter_amount` | Enter amount | Saisir un montant | أدخل مبلغًا |
| `menu.sold_out` | Sold out | Épuisé | نفد |
| `menu.tile_label` | {name}, {price} | {name}, {price} | {name}، {price} |
| `menu.tile_label_options` | {name}, {price}, has options | {name}, {price}, avec options | {name}، {price}، بخيارات |
| `options.required` | Required · choose {n} | Obligatoire · choisissez {n} | إلزامي · اختر {n} |
| `options.optional` | Optional · up to {n} | Facultatif · jusqu'à {n} | اختياري · حتى {n} |
| `options.add` | Add to bill · {amount} | Ajouter · {amount} | أضف إلى الحساب · {amount} |
| `options.missing` | Choose {group} to continue. | Choisissez {group} pour continuer. | اختر {group} للمتابعة. |
| `options.note` | Note for the kitchen | Note pour la cuisine | ملاحظة للمطبخ |
| `bill.send` | Send {n} to kitchen | Envoyer en cuisine · {n} | أرسل إلى المطبخ · {n} |
| `bill.take_payment` | Charge {amount} | Encaisser {amount} | حصّل {amount} |
| `bill.not_sent` | Not sent · {n} | Non envoyé · {n} | لم يُرسَل · {n} |
| `bill.sent_at` | Sent {time} | Envoyé à {time} | أُرسل عند {time} |
| `bill.meta` (plural on guests; AR six forms: §9.2, guest, nominative) | {n} guests · open since {time} · {staff} | {n} couverts · ouverte depuis {time} · {staff} | {n} ضيف · مفتوحة منذ {time} · {staff} |
| `bill.empty.title` | No items yet | Aucun article | لا أصناف بعد |
| `bill.empty.body` | Tap a dish to add it. | Touchez un plat pour l'ajouter. | اضغط على طبق لإضافته. |
| `bill.unsaved` | Not saved yet. Kiwi keeps trying in the background. | Pas encore enregistré. Kiwi réessaie en arrière-plan. | لم يُحفظ بعد. يواصل Kiwi المحاولة في الخلفية. |
| `bill.queued` | Saved. Sends when you're back online. | Enregistré. Envoi dès le retour de la connexion. | تم الحفظ. سيُرسَل عند عودة الاتصال. |
| `bill.total` | Total | Total | المجموع |
| `bill.split` (revision 6: FR matches `split.title`) | Split | Diviser | قسّم |
| `bill.discount` | Discount | Remise | خصم |
| `bill.print` | Print bill | Imprimer l'addition | اطبع الحساب |
| `bill.view` (label; the count is the badge on the icon and the amount is a separate trailing part, §10.32) | View bill | Voir l'addition | اعرض الحساب |
| `bill.view_a11y` (plural; AR six forms: §9.2, item, nominative) | View bill, {n} items, {amount} | Voir l'addition, {n} articles, {amount} | اعرض الحساب، {n} صنف، {amount} |
| `bill.recent` | Recent changes | Modifications récentes | التغييرات الأخيرة |
| `bill.removed_toast` | {item} removed | {item} retiré | أُزيل {item} |
| `split.title` | Split the bill · {amount} | Diviser l'addition · {amount} | تقسيم الحساب · {amount} |
| `split.equally` | Equally | À parts égales | بالتساوي |
| `split.by_item` | By item | Par article | حسب الصنف |
| `split.shares` | Number of shares | Nombre de parts | عدد الحصص |
| `split.share_n` | Share {n} | Part {n} | الحصة {n} |
| `split.pay_share` | Charge share {n} | Encaisser la part {n} | حصّل الحصة {n} |
| `split.progress` | Shares paid: {paid} of {total} | Parts payées : {paid} sur {total} | الحصص المدفوعة: {paid} من {total} |
| `split.tip` (revision 6, §10.30) | Shared tip | Pourboire commun | بقشيش مشترك |
| `split.tip_share` | Tip {amount} | Pourboire {amount} | البقشيش {amount} |
| `split.unassigned` (plural; AR invariant, §9.2) | {n} items not in a share yet | {n} articles sans part | أصناف بلا حصة: {n} |
| `discount.title` | Add discount | Ajouter une remise | إضافة خصم |
| `discount.percent` | Percent | Pourcentage | نسبة |
| `discount.amount` | Amount | Montant | مبلغ |
| `discount.reason.commercial` (server code `commercial`) | Goodwill gesture | Geste commercial | بادرة تجارية |
| `discount.reason.loyal` (server code `loyal-customer`) | Loyal customer | Client habitué | زبون وفيّ |
| `discount.reason.kitchen` (server code `kitchen-error`) | Kitchen error | Erreur cuisine | خطأ في المطبخ |
| `reason.other` (server code `other`) | Other | Autre | أخرى |
| `discount.preview` | Discount {pct} · −{amount} · new total {total} | Remise {pct} · −{amount} · nouveau total {total} | خصم {pct} · −{amount} · المجموع الجديد {total} |
| `discount.apply` | Apply −{amount} | Appliquer −{amount} | طبّق −{amount} |
| `discount.manager` | A manager's code is needed for every discount. | Un code responsable est nécessaire pour toute remise. | يلزم رمز المسؤول لكل خصم. |
| `discount.too_large` | A discount can't be more than the bill. | Une remise ne peut pas dépasser l'addition. | لا يمكن أن يتجاوز الخصم قيمة الحساب. |
| `discount.not_allowed` | This percentage isn't allowed in your discount settings. | Ce pourcentage n'est pas autorisé dans vos réglages de remise. | هذه النسبة غير مسموح بها في إعدادات الخصم. |
| `discount.line` | Discount · {reason} | Remise · {reason} | خصم · {reason} |
| `pay.title` | {bill} · Payment | {bill} · Paiement | {bill} · الدفع |
| `pay.amount_due` | Amount due | Montant dû | المبلغ المستحق |
| `pay.tip` (revision 6, §10.26) | Tip | Pourboire | البقشيش |
| `pay.tip.none` | No tip | Sans pourboire | بدون بقشيش |
| `pay.tip.pct` (option row and the row's value) | {pct} · {amount} | {pct} · {amount} | {pct} · {amount} |
| `pay.tip.other` | Other percentage | Autre pourcentage | نسبة أخرى |
| `pay.tip.other_title` (keypad title) | Tip percentage | Pourcentage du pourboire | نسبة البقشيش |
| `pay.tip_breakdown` | Bill {bill} · Tip {tip} | Addition {bill} · Pourboire {tip} | الحساب {bill} · البقشيش {tip} |
| `pay.cash` | Cash | Espèces | نقدًا |
| `pay.card` | Card on your terminal | Carte sur votre terminal | بطاقة على جهاز الدفع |
| `pay.other` (revision 23, P1: recorded as the method `wallet`, which the shipped dashboard calls Mobile and the till prints "Virement"; the shipped till has no voucher method, §18.2) | Other (transfer or wallet) | Autre (virement ou portefeuille) | أخرى (تحويل أو محفظة) |
| `pay.received` | Received {amount} | Reçu {amount} | المستلم {amount} |
| `pay.change` | Change {amount} | Rendu {amount} | الباقي {amount} |
| `pay.exact` (chip; its accessible name is `pay.exact_a11y`) | Exact | Exact | بالضبط |
| `pay.exact_a11y` | Exact amount, {amount} | Montant exact, {amount} | المبلغ بالضبط، {amount} |
| `pay.cash.confirm` | Confirm cash payment | Valider en espèces | أكّد الدفع نقدًا |
| `pay.cash.short` | Enter at least {amount}. | Saisissez au moins {amount}. | أدخل {amount} على الأقل. |
| `pay.card.body` | Take {amount} on your card terminal. When it shows Approved, confirm here. | Encaissez {amount} sur votre terminal. Quand il affiche Accepté, validez ici. | حصّل {amount} على جهاز البطاقات. عندما يظهر «مقبول»، أكّد هنا. |
| `pay.card.confirm` (revision 6: verb first) | Confirm card payment | Valider le paiement carte | أكّد الدفع بالبطاقة |
| `pay.preauth` | Pre-authorisation needs a connected terminal. Not available yet. | La pré-autorisation nécessite un terminal connecté. Pas encore disponible. | التفويض المسبق يتطلب جهاز دفع متصلًا. غير متاح بعد. |
| `pay.paid` | Paid | Payé | مدفوع |
| `pay.not_recorded` (revision 7: shown only when nothing was journaled, §10.26) (revision 15, P8: AR الحساب, the glossary's bill, replaces الفاتورة) | This sale wasn't recorded, so nothing was saved. Check the bill, then try again. | Cette vente n'a pas été enregistrée, rien n'a donc été gardé. Vérifiez l'addition, puis réessayez. | لم يُسجَّل هذا البيع، فلم يُحفظ شيء. تحقّق من الحساب ثم حاول مرة أخرى. |
| `sync.saved_here` (revision 8: only after `persistShift` confirmed the write, §10.26) | Saved on this till | Enregistré sur cette caisse | محفوظ على هذا الصندوق |
| `sync.screen_only` (revision 8, F1: the autosave failed, so the sale may exist only in this page) | Recorded on this screen only. Keep the till open. | Enregistrée sur cet écran seulement. Gardez la caisse ouverte. | مسجّلة على هذه الشاشة فقط. أبقِ الصندوق مفتوحًا. |
| `sync.sending` (plural; AR six forms: §9.2, sale, after إرسال) | Sending {n} sales | Envoi de {n} ventes | جارٍ إرسال {n} عملية بيع |
| `sync.waiting` (plural; AR six forms: §9.2, sale, nominative) | {n} sales waiting for the connection | {n} ventes en attente de connexion | {n} عملية بيع بانتظار الاتصال |
| `sync.all_sent` | All sales sent | Toutes les ventes sont envoyées | أُرسلت جميع المبيعات |
| `sync.blocked` (plural; AR six forms: §9.2, sale, nominative) | {n} sales not accepted. Open to see why. | {n} ventes refusées. Ouvrez pour voir pourquoi. | {n} عملية بيع لم تُقبل. افتح لمعرفة السبب. |
| `sync.storage_error` (revision 7) | This till's storage is full, so new sales may be held only on this screen until they're sent. Keep this till open and don't reload it. | Le stockage de cette caisse est plein : les nouvelles ventes peuvent n'exister que sur cet écran jusqu'à leur envoi. Gardez cette caisse ouverte et ne la rechargez pas. | ذاكرة هذا الصندوق ممتلئة، فقد لا تكون المبيعات الجديدة محفوظة إلا على هذه الشاشة إلى أن تُرسَل. أبقِ هذا الصندوق مفتوحًا ولا تُعِد تحميله. |
| `sync.not_synced` (revision 7; plural; AR six forms: §9.2, sale, nominative) | {n} sales on this till only, not sent | {n} ventes sur cette caisse seulement, non envoyées | {n} عملية بيع على هذا الصندوق فقط، لم تُرسَل |
| `sync.send_now` (revision 7) | Send now | Envoyer maintenant | أرسل الآن |
| `sync.off` (revision 9, M1: Live Link off; a neutral More row, never a warning) | Sales from this till aren't sent to the dashboard. They stay on this till. | Les ventes de cette caisse ne sont pas envoyées au tableau de bord. Elles restent sur cette caisse. | مبيعات هذا الصندوق لا تُرسَل إلى لوحة التحكم. تبقى على هذا الصندوق. |
| `sync.waiting_store` (revision 9, M1; revision 10, P4: "commerce", as in `pin.*` and `access.*`; plural; AR six forms: §9.2, sale, nominative) | {n} sales waiting to be linked to your store | {n} ventes en attente de rattachement à votre commerce | {n} عملية بيع في انتظار ربطها بمتجرك |
| `sync.not_saved` (revision 9, M2: banner and indicator row while the till's autosave fails) | This till couldn't save its latest sales. Keep it open and don't reload it until this message goes. | Cette caisse n'a pas pu enregistrer ses dernières ventes. Gardez-la ouverte et ne la rechargez pas tant que ce message est affiché. | تعذّر على هذا الصندوق حفظ آخر مبيعاته. أبقِه مفتوحًا ولا تُعِد تحميله حتى تختفي هذه الرسالة. |
| `lock.store.title` (revision 21, F2: the store lock of §10.26, as shipped in `till-tenant.js@762bb255:163-194`, `title`; FR "verrouillée", the till's own lock verb) | Till locked | Caisse verrouillée | الصندوق مقفل |
| `lock.store.body` (revision 21, F2: shipped `body`, changed: it says the till is no longer paired with {store}, which holds after a re-pair and after an unpair, where the shipped line says the till changed store, and in AR that it was paired with another store; AR says الحسابات for bills, the glossary's bill) | This till is no longer paired with {store}, but {store}'s service is still open on it. The tables, bills and sales from this service stay on this device. Nothing is sent to another store. | Cette caisse n'est plus appairée à {store}, mais le service de {store} y est encore ouvert. Les tables, les additions et les ventes de ce service restent sur cet appareil. Rien n'est envoyé à un autre commerce. | لم يعد هذا الصندوق مربوطًا بـ{store}، لكن خدمة {store} ما زالت مفتوحة عليه. تبقى الطاولات والحسابات ومبيعات هذه الخدمة على هذا الجهاز، ولا يُرسَل أي شيء إلى متجر آخر. |
| `lock.store.next` (revision 21, F2: shipped `next`, kept) | To resume the service, pair the till back to {store} with a code generated from its dashboard. | Pour reprendre le service, réappairez la caisse à {store} avec un code généré depuis son tableau de bord. | لاستئناف الخدمة، أعد ربط الصندوق بـ{store} برمز يتم إنشاؤه من لوحة التحكم الخاصة به. |
| `lock.store.reload` (revision 21, F2: shipped `reload`, changed: "up to 12 hours", because the limit counts from the service's last save; revision 22, F2: it names the screen's second action, `lock.store.open_without`, not a page reload, which the iPad app and the installed web app have no control for; revision 23, P3: it names the action by its new label, which is true paired or unpaired) | Leaving this service keeps it set aside on this device for up to 12 hours. It comes back as soon as the till is paired back to {store}. | Quitter ce service le garde mis de côté sur cet appareil jusqu'à 12 heures. Il revient dès que la caisse est réappairée à {store}. | ترك هذه الخدمة يُبقيها محفوظة جانبًا على هذا الجهاز لمدة أقصاها 12 ساعة. وتعود بمجرد إعادة ربط الصندوق بـ{store}. |
| `lock.store.open_without` (revision 22, F2: the lock screen's second action, which runs the reload the shipped screen only describes, §10.26 difference 6; no shipped counterpart; AR an imperative, as every button; revision 23, P3: it was "Open the till without this service", false when the till is unpaired, where the reload opens the pairing pad) | Leave this service | Quitter ce service | اترك هذه الخدمة |
| `lock.store.action` (revision 21, F2: shipped `action`, changed: a fixed verb with no store name, which the line above names, §6.6; AR an imperative, as every button) | Pair back | Réappairer | أعد الربط |
| `lock.store.prompt` (revision 21, F2: shipped `prompt`, changed to sentence case; the title step of the pairing pad the lock opens) | Pair back to {store} · 6-digit code | Réappairer à {store} · code à 6 chiffres | إعادة الربط بـ{store} · رمز من 6 أرقام |
| `lock.store.foot` (revision 21, F2: shipped `foot`, kept; under the keys of that pad) | Generate a code from {store}'s dashboard › Till | Générez un code depuis le tableau de bord de {store} › Caisse | أنشئ رمزًا من لوحة تحكم {store} › الصندوق |
| `lock.store.unnamed` (revision 21, F2: shipped `fallback`, kept; fills `{store}` in the keys above when the store's name is unknown) | the other store | l'autre commerce | المتجر الآخر |
| `sync.saved_again` (revision 10, M4: announced once, `role="status"`, when the last danger banner of §10.26 clears; revision 12, M3: not for the store lock, whose exit is A's staff pad) | This till is saving its sales again. | Cette caisse enregistre à nouveau ses ventes. | عاد هذا الصندوق إلى حفظ مبيعاته. |
| `receipt.print` | Print receipt | Imprimer le ticket | اطبع الإيصال |
| `receipt.send` | Send receipt | Envoyer le ticket | أرسل الإيصال |
| `drawer.sending` | Sending drawer signal | Envoi du signal au tiroir | جارٍ إرسال إشارة الدرج |
| `drawer.sent` | Drawer signal sent | Signal envoyé au tiroir | أُرسلت إشارة الدرج |
| `drawer.failed` | Drawer signal failed. Open it with the key. | Échec du signal au tiroir. Ouvrez-le avec la clé. | فشلت إشارة الدرج. افتحه بالمفتاح. |
| `drawer.unknown` | The drawer signal may not have arrived. Check the drawer, or use the key. | Le signal n'est peut-être pas arrivé. Vérifiez le tiroir ou utilisez la clé. | ربما لم تصل إشارة الدرج. تحقّق من الدرج أو استخدم المفتاح. |
| `drawer.no_bridge` | No printer bridge online. Open the drawer with the key. | Aucun pont d'impression en ligne. Ouvrez le tiroir avec la clé. | لا يوجد جسر طباعة متصل. افتح الدرج بالمفتاح. |
| `void.title` | Void {item} | Annuler l'article {item} | إلغاء الصنف {item} |
| `void.confirm` | Void item | Annuler l'article | ألغِ الصنف |
| `void.keep` | Keep item | Garder l'article | أبقِ على الصنف |
| `void.kds` | The kitchen screen strikes the line through with "Voided". | L'écran cuisine barre la ligne avec « Annulé ». | تشطب شاشة المطبخ السطر مع «أُلغي». |
| `void.stock_generic` | Stock follows your stock settings. | Le stock suit vos réglages de stock. | يتبع المخزون إعدادات المخزون لديك. |
| `void.stock_return` | The item goes back into stock. | L'article revient en stock. | يعود الصنف إلى المخزون. |
| `void.stock_waste` | The item is recorded as waste. | L'article est enregistré en perte. | يُسجَّل الصنف كهدر. |
| `void.reason.mind` | Customer changed their mind | Le client a changé d'avis | غيّر الزبون رأيه |
| `void.reason.kitchen` | Kitchen mistake | Erreur de cuisine | خطأ في المطبخ |
| `void.reason.wrong` | Wrong item | Mauvais article | صنف خاطئ |
| `bill.edit_options` | Edit options | Modifier les options | عدّل الخيارات |
| `bill.remove` | Remove | Retirer | إزالة |
| `bill.void` | Void item | Annuler l'article | ألغِ الصنف |
| `bill.transfer` | Move to another table | Changer de table | انقل إلى طاولة أخرى |
| `bill.merge` | Merge tables | Fusionner des tables | ادمج الطاولات |
| `bill.clear` | Clear bill | Vider l'addition | أفرغ الحساب |
| `bill.cancel_table` | Cancel table | Annuler la table | ألغِ الطاولة |
| `till.lock` | Lock the till | Verrouiller la caisse | اقفل الصندوق |
| `device.sound` (switch in This device, revision 6, §15.0) | Payment sound | Son de paiement | صوت الدفع |
| `till.switch_cashier` | Switch cashier | Changer de caissier | بدّل أمين الصندوق |
| `till.nav.floor` / `.takeaway` / `.waiting` / `.kitchen` / `.more` | Floor / Takeaway / Waiting / Kitchen / More | Salle / À emporter / En attente / Cuisine / Plus | الصالة / للأخذ / قيد الانتظار / المطبخ / المزيد |
| `till.more.shift` / `.manage` / `.device` (More sections) | Shift / Manage / This device | Service / Gestion / Cet appareil | الوردية / الإدارة / هذا الجهاز |
| `till.more.refund` / `.cash_in_out` / `.shift_change` | Refund a sale / Cash in or out / Shift change | Rembourser une vente / Entrée ou sortie d'espèces / Relève de caisse | استرداد مبلغ بيع / إدخال أو إخراج نقد / تبديل الوردية |
| `till.more.cancel_sale` / `.close` (revision 25, P10: the More rows that start `act.cancel_sale` and `act.close_till`; shipped "Annuler une vente" and "Fin de service", `kiwi-caisse.html@31c94529:6044-6059`, `:6137-6140`; "End of shift" is a retired name, §9.1) | Cancel a sale / Close the till | Annuler une vente / Clôturer la caisse | ألغِ عملية بيع / أغلق الصندوق |
| `till.more.menu` / `.stock` / `.loyalty` / `.printer` | Menu / Stock / Customers and loyalty / Printer and kitchen printing | Menu / Stock / Clients et fidélité / Imprimante et impression cuisine | القائمة / المخزون / الزبناء والولاء / الطابعة وطباعة المطبخ |
| `till.more.open_drawer` (revision 24, M1: shipped "Ouvrir le tiroir", `kiwi-caisse.html@31c94529:6060-6063`) | Open the drawer | Ouvrir le tiroir | افتح الدرج |
| `till.more.team` (revision 24, M1: the row and its sheet's title; shipped "Équipe" with the on-shift count, `:6092-6096`) | Team on shift | Équipe en service | الفريق في الوردية |
| `till.more.sales` (revision 24, M1: the shipped sales journal, `:6068-6081`, `:16806-16807`) | Sales this shift | Ventes du service | مبيعات هذه الوردية |
| `till.sales.summary` / `.items` / `.journal` (revision 24, M1: the journal's three tabs, `:6965-6967`) | Summary / Sales by item / Journal | Résumé / Ventes par article / Journal | الملخص / المبيعات حسب الصنف / السجل |
| `till.more.fullscreen` / `.exit_fullscreen` (revision 24, M1: browser tills only, `:6132-6136`) | Fullscreen / Exit fullscreen | Plein écran / Quitter le plein écran | ملء الشاشة / الخروج من ملء الشاشة |
| `till.more.reload` (revision 24, M1: shipped "Rafraîchir", `assets/caisse-refresh.js@31c94529:204-218`) | Reload the till | Recharger la caisse | أعِد تحميل الصندوق |
| `till.more.device_id` (revision 24, M1: the paired till's id, its last six characters as the trailing value; shipped `:6022`, `:18711-18730`) | Till ID | Identifiant de caisse | معرّف الصندوق |
| `till.device_id_copied` (toast) | Till ID copied | Identifiant de caisse copié | نُسخ معرّف الصندوق |
| `till.team.on` / `.break` / `.off` (revision 24, M1: section headers, invariant counts, §9.2; shipped `:17589-17606`) | On shift · {n} / On break · {n} / Not on shift · {n} | En service · {n} / En pause · {n} / Pas en service · {n} | في الوردية · {n} / في استراحة · {n} / خارج الوردية · {n} |
| `till.team.break_since` | On break since {time} | En pause depuis {time} | في استراحة منذ {time} |
| `till.team.start_break` / `.end_break` (revision 24, M1: shipped `manager-pause` and `manager-resume`, `:17639-17657`) | Start break / End break | Commencer la pause / Terminer la pause | ابدأ الاستراحة / أنهِ الاستراحة |
| `till.team.message` / `.message_all` (revision 24, M1: shipped `:17658-17666`, `:17611-17613`) | Message / Message the team | Écrire / Écrire à toute l'équipe | راسِل / راسِل الفريق |
| `till.team.message_to` (the composer's title for one person) | Message to {name} | Message à {name} | رسالة إلى {name} |
| `till.team.message_field` / `.send` | Your message / Send | Votre message / Envoyer | رسالتك / أرسِل |
| `till.team.quick` (revision 25, M3: the four quick messages' chips, shipped `kiwi-caisse.html@31c94529:7200-7203`) | Table ready / Customer waiting / Till / Break over | Table prête / Client attend / Caisse / Fin pause | الطاولة جاهزة / زبون ينتظر / الصندوق / انتهت الاستراحة |
| `till.team.quick_text` (revision 25, M3: the message each chip puts in the field, shipped as its `data-msg`; FR is the shipped text as it is, Darija included, and EN and AR carry its request) | Table ready, please come and clear it. / A customer is waiting. / Please come back to the till. / Break's over, back to service. | Table prête, merci de venir la débarrasser. / Khalik blati svp · client attend. / Reviens à la caisse stp. / Pause finie, 3awd l'service. | الطاولة جاهزة، المرجو المجيء لإخلائها. / زبون ينتظر. / ارجع إلى الصندوق من فضلك. / انتهت الاستراحة، عُد إلى الخدمة. |
| `till.team.sent` (toast) | Message sent | Message envoyé | أُرسلت الرسالة |
| `till.team.not_sent` (toast; shipped `:17742`) | Message not sent. Check the connection. | Message non envoyé. Vérifiez la connexion. | لم تُرسَل الرسالة. تحقّق من الاتصال. |
| `till.team.break_failed` (toast; shipped `:17653-17656`) | Break not saved. Check the connection. | Pause non enregistrée. Vérifiez la connexion. | لم تُحفظ الاستراحة. تحقّق من الاتصال. |
| `till.team.not_clocked_in` (toast, on a 409 `employee-not-clocked-in`, `functions/api/team/live.js@31c94529:212`) | {name} isn't clocked in. | {name} n'est pas pointé. | {name} لم يسجّل حضوره. |
| `till.team.empty` (shipped for a real store with no roster, `:17591-17593`) | No one is on shift. Add your team from the dashboard, in Team. | Personne n'est en service. Ajoutez votre équipe depuis le tableau de bord, dans Équipe. | لا أحد في الوردية. أضف فريقك من لوحة التحكم، في قسم الفريق. |
| `bill.cancel_order` (revision 24, M1: the entry of `act.cancel_order`, on a takeaway order already sent; shipped "Annuler la commande", `:10908`) | Cancel order | Annuler la commande | ألغِ الطلب |
| `takeaway.untrack` (revision 24, M1: the entry of `act.untrack_order`; shipped "Retirer du suivi", `:20928`) | Remove from tracking | Retirer du suivi | أزِل من المتابعة |
| `takeaway.reject` (revision 24, M1: the entry of `act.reject_online`; shipped "Refuser", `assets/orderpro-inbox.js@31c94529:674`) | Reject | Refuser | ارفض |
| `till.nav.takeaway_a11y` (aria; revision 25, M2: the Takeaway item with its badge; an invariant count, §9.2) | Takeaway, {n} to accept | À emporter, {n} à accepter | للأخذ، {n} للقبول |
| `online.section` (revision 25, M2: the Takeaway tab's online orders; shipped "Commandes clients", `orderpro-inbox.js@31c94529:829`) | Online orders | Commandes en ligne | الطلبات الإلكترونية |
| `online.to_accept` / `.in_kitchen` / `.ready` (the three groups, shipped `:708-710`; invariant counts, §9.2) | To accept · {n} / In the kitchen · {n} / Ready · {n} | À accepter · {n} / En cuisine · {n} / Prêtes · {n} | للقبول · {n} / في المطبخ · {n} / جاهزة · {n} |
| `online.accept` (shipped "Envoyer en cuisine", `:682`) | Send to kitchen | Envoyer en cuisine | أرسِل إلى المطبخ |
| `online.cancel` (shipped "Annuler" on an order past acceptance, `:674`; the entry of `act.reject_online` there) | Cancel | Annuler | ألغِ |
| `online.hand_over` (shipped "Remise au client", `:688`; "Remise" is a retired name, §9.1) | Hand over | Remettre | سلِّم |
| `online.delivery` (shipped "Livraison", `:656`) | Delivery | Livraison | توصيل |
| `online.source.generic` (shipped "Canal extérieur", `:544`) | Outside channel | Canal extérieur | قناة خارجية |
| `online.print` (revision 25, M2: the shipped `printOrder`, which no card draws a button for) | Print kitchen ticket | Imprimer le bon | اطبع تذكرة المطبخ |
| `online.arrived` / `online.arrived_sub` (toast; shipped `:446-456`; an invariant count) | New online orders · {n} / From a customer's phone | Nouvelles commandes en ligne · {n} / Depuis le téléphone d'un client | طلبات إلكترونية جديدة · {n} / من هاتف أحد الزبناء |
| `online.expiring` (toast; shipped `:484`) | {order} has waited 20 min. It expires in about {min} min. | {order} attend depuis 20 min. Elle expire dans environ {min} min. | {order} في الانتظار منذ 20 دقيقة. ينتهي خلال {min} دقيقة تقريبًا. |
| `online.not_confirmed` (toast; shipped `:273`) | Not confirmed. The order is unchanged. Try again. | Action non confirmée. La commande est inchangée. Réessayez. | لم يُؤكَّد الإجراء. لم يتغيّر الطلب. حاول مرة أخرى. |
| `online.refused_pairing` (toast, a 403; shipped `:271-272`) | Refused. Check this till's pairing. | Action refusée. Vérifiez l'appairage de cette caisse. | رُفض الإجراء. تحقّق من ربط هذا الصندوق. |
| `device.order_sound` (switch in This device, revision 25, M2; shown when online ordering is on) | Online order sound | Son des commandes en ligne | صوت الطلبات الإلكترونية |
| `cancel.confirm` | Cancel sale · {amount} | Annuler la vente · {amount} | إلغاء البيع · {amount} |
| `cancel.keep` | Keep sale | Garder la vente | أبقِ على البيع |
| `cancel.card_body` | Sale cancelled in Kiwi. Refund the card on your terminal. | Vente annulée dans Kiwi. Remboursez la carte sur votre terminal. | أُلغي البيع في Kiwi. استرجع المبلغ للبطاقة من جهاز الدفع. |
| `cancel.cash_body` | Give back {amount} in cash. | Rendez {amount} en espèces. | أعد {amount} نقدًا. |
| `floor.table` | Table {n} | Table {n} | الطاولة {n} |
| `count.title` (revision 6: the glossary's name) | Cash count | Comptage de caisse | عدّ النقد |
| `count.notes` (section label) | Notes | Billets | الأوراق النقدية |
| `count.coins` (section label) | Coins | Pièces | القطع النقدية |
| `count.denom` (row label; the value is formatted by `KiwiFormat`) | {value} | {value} | {value} |
| `count.enter_total` | Enter the total instead | Saisir le total directement | أدخل المجموع مباشرة |
| `count.next` (key label) | Next | Suivant | التالي |
| `count.row_a11y` | {denomination}, {n} counted, {subtotal} | {denomination}, {n} comptés, {subtotal} | {denomination}، المعدود {n}، {subtotal} |
| `count.opening_float` | Opening float | Fond de caisse | رصيد الافتتاح |
| `count.cash_sales` | Cash sales | Ventes en espèces | المبيعات النقدية |
| `count.cash_refunds` | Cash refunds | Remboursements en espèces | المبالغ المستردة نقدًا |
| `count.cash_refunds_sub` (revision 7, M1: a sub-line, not a term) | After {amount} refunded in cash | Après {amount} remboursés en espèces | بعد استرداد {amount} نقدًا |
| `count.cash_tips` (revision 6) | Cash tips | Pourboires en espèces | البقشيش النقدي |
| `count.cash_in` | Cash in | Entrées d'espèces | إدخال نقد |
| `count.cash_out` | Cash out | Sorties d'espèces | إخراج نقد |
| `count.expected` | Expected | Attendu | المتوقع |
| `count.counted` | Counted | Compté | المعدود |
| `count.difference` | Difference | Écart | الفرق |
| `count.close` | Close the till | Clôturer la caisse | أغلق الصندوق |
| `count.close_hint` | Count the drawer to close the till. | Comptez le tiroir pour clôturer la caisse. | عُدّ الدرج لإغلاق الصندوق. |
| `count.same_as_last` (chip; accessible name `count.same_as_last_a11y`) | Last float · {amount} | Dernier fond · {amount} | آخر رصيد · {amount} |
| `count.same_as_last_a11y` | Use the same opening float as last time, {amount} | Reprendre le fond de la dernière ouverture, {amount} | استعمل رصيد الافتتاح السابق نفسه، {amount} |
| `count.open` | Open the till | Ouvrir la caisse | افتح الصندوق |
| `z.title` | Z report {n} | Rapport Z {n} | تقرير Z رقم {n} |
| `z.day` | Business day {date} · {start} to {end} | Journée du {date} · {start} à {end} | يوم العمل {date} · من {start} إلى {end} |
| `z.by_method` | Sales by method | Ventes par moyen de paiement | المبيعات حسب وسيلة الدفع |
| `z.refunds` | Refunds | Remboursements | المبالغ المستردة |
| `z.cancelled` | Cancelled sales | Ventes annulées | المبيعات الملغاة |
| `z.voided` | Voided items | Articles annulés | الأصناف الملغاة |
| `z.discounts` | Discounts | Remises | الخصومات |
| `z.vat` | VAT by rate | TVA par taux | الضريبة حسب النسبة |
| `z.cash` | Cash | Espèces | النقد |
| `z.tips` (revision 6) | Tips | Pourboires | البقشيش |
| `z.closed_by` | Closed by {name} at {time} | Clôturé par {name} à {time} | أغلقه {name} عند {time} |
| `z.print` | Print Z report | Imprimer le rapport Z | اطبع تقرير Z |
| `z.export` | Export PDF | Exporter en PDF | صدّر PDF |
| `z.cutoff_conflict` | This day was closed under two different day boundaries. Figures follow each Z report. | Cette journée a été clôturée avec deux limites de journée différentes. Les chiffres suivent chaque rapport Z. | أُغلق هذا اليوم بحدّين مختلفين ليوم العمل. تتبع الأرقام كل تقرير Z. |
| `attendance.show` | Attendance code | Code de pointage | رمز الحضور |
| `attendance.body` | Type this code in the team app to clock in or out. | Saisissez ce code dans l'app équipe pour pointer. | اكتب هذا الرمز في تطبيق الفريق لتسجيل الحضور أو الانصراف. |
| `attendance.changes_at` | Changes at {time} | Change à {time} | يتغيّر عند {time} |
| `attendance.refresh_failed` (revision 9, P9: a refresh poll failed while a code is showing, §10.34) | Couldn't check for a newer code. This one expires at {time}. | Impossible de vérifier s'il existe un code plus récent. Celui-ci expire à {time}. | تعذّر التحقق من وجود رمز أحدث. ينتهي هذا الرمز عند {time}. |
| `attendance.creating` | Creating a code | Création du code | جارٍ إنشاء الرمز |
| `attendance.failed` | Couldn't create a code. Check the connection and try again. | Impossible de créer un code. Vérifiez la connexion et réessayez. | تعذّر إنشاء رمز. تحقّق من الاتصال وحاول مجددًا. |

**Dashboard (`dashboard`)**

| Key | EN | FR | AR |
| --- | --- | --- | --- |
| `nav.home` / `.orders` / `.report` / `.customers` / `.more` | Home / Orders / Report / Customers / More | Accueil / Commandes / Rapport / Clients / Plus | الرئيسية / الطلبات / التقرير / الزبناء / المزيد |
| `nav.ai` (aria) / `nav.notifications` (aria) | Kiwi AI / Notifications | Kiwi AI / Notifications | Kiwi AI / الإشعارات |
| `nav.venue` (aria) | Change venue, {venue} | Changer d'établissement, {venue} | غيّر المؤسسة، {venue} |
| `home.goal` (revision 24, M2: the goal line under the key figure; `{pct}` is `KiwiFormat.share` of the day's revenue over the goal, `{amount}` the goal through `num` with its unit, §6.3) | {pct} of the {amount} goal | {pct} de l'objectif de {amount} | {pct} من هدف {amount} |
| `home.goal_set` (revision 24, M2: Plain, in the goal line's place while no goal is set) | Set a daily goal | Fixer un objectif du jour | حدّد هدفًا يوميًا |
| `range.today_date` | Today · {date} | Aujourd'hui · {date} | اليوم · {date} |
| `range.today` / `.yesterday` / `.d7` / `.d30` | Today / Yesterday / 7 days / 30 days | Aujourd'hui / Hier / 7 jours / 30 jours | اليوم / أمس / 7 أيام / 30 يومًا |
| `range.this_week` / `.this_month` | This week / This month | Cette semaine / Ce mois-ci | هذا الأسبوع / هذا الشهر |
| `range.show` | Show {from} to {to} | Afficher du {from} au {to} | اعرض من {from} إلى {to} |
| `range.days_run` | Days run {start} to {end}. | Les journées vont de {start} à {end}. | يمتد يوم العمل من {start} إلى {end}. |
| `range.days_calendar` | Days follow the calendar. | Les journées suivent le calendrier. | تتبع الأيام التقويم. |
| `range.end_before_start` | The end date is before the start date. | La date de fin précède la date de début. | تاريخ النهاية يسبق تاريخ البداية. |
| `range.prev_month` | Previous month | Mois précédent | الشهر السابق |
| `range.next_month` | Next month | Mois suivant | الشهر التالي |
| `range.in_range` (aria, per day) | in range | dans la période | ضمن الفترة |
| `ia.today` / `ia.sell` / `ia.customers` / `ia.team` / `ia.money` (sidebar sections) | Today / Sell / Customers / Team / Money | Aujourd'hui / Vente / Clients / Équipe / Argent | اليوم / البيع / الزبناء / الفريق / المال |
| `ia.floor_plan` / `.reservations` / `.menu_options` / `.menu_analysis` | Floor plan / Reservations / Menu and options / Menu analysis | Plan de salle / Réservations / Menu et options / Analyse du menu | مخطط الصالة / الحجوزات / القائمة والخيارات / تحليل القائمة |
| `ia.retention` / `.planning` / `.terminals` / `.cash_z` / `.compliance` / `.stock` | Retention / Planning / Terminals / Cash and Z / Compliance / Stock and purchasing | Fidélisation / Planning / Terminaux / Caisse et Z / Conformité / Stock et achats | الاحتفاظ بالزبناء / التخطيط / أجهزة الدفع / النقد وتقارير Z / الامتثال / المخزون والمشتريات |
| `ia.settings` / `.operator` | Settings / Operator | Réglages / Opérateur | الإعدادات / المشغّل |
| `ia.invoicing` / `.accounting` (revision 23, M2) | Invoicing / Accounting | Facturation / Comptabilité | الفوترة / المحاسبة |
| `settings.business` / `.devices` / `.team_codes` / `.appearance` / `.language` / `.haptics` / `.notifications` / `.account` | Business / Devices / Team codes / Appearance / Language / Haptics / Notifications / Account | Commerce / Appareils / Codes de l'équipe / Apparence / Langue / Retours haptiques / Notifications / Compte | النشاط التجاري / الأجهزة / رموز الفريق / المظهر / اللغة / الاهتزاز / الإشعارات / حساب Kiwi |
| `settings.cutoff` | Business day starts at | La journée commence à | يبدأ يوم العمل عند |
| `settings.sign_out` | Sign out | Se déconnecter | سجّل الخروج |
| `settings.goal` (revision 24, M2: Settings › Business; shipped "Objectif journalier", `assets/interactive.js@319ac100:2178`, `:2182`) | Daily goal | Objectif journalier | الهدف اليومي |
| `settings.goal_unset` (its trailing value while no goal is set; shipped `dateRange.js@319ac100:650`) | Not set | À définir | غير محدد |
| `settings.channels` (shipped `assets/interactive.js@31c94529:2234`; shown for a real venue, §12) | Delivery channels | Canaux de livraison | قنوات التوصيل |
| `settings.channels_sub` (shipped, same line) | Connect Glovo, Yassir and accounting | Connectez Glovo, Yassir et votre compta | اربط Glovo وYassir ومحاسبتك |
| `settings.morning` (shipped `assets/interactive.js` on `main`, §12) | Morning briefing | Le point du matin | ملخص الصباح |
| `settings.morning_sub` (shipped, same line) | Yesterday's total at opening · this device | Le total d'hier à l'ouverture · cet appareil | مجموع الأمس عند الافتتاح · هذا الجهاز |
| `compare.title` | Compare with | Comparer avec | قارن مع |
| `compare.delta` | {delta} ({pct}) vs {baseline} | {delta} ({pct}) par rapport à {baseline} | {delta} ({pct}) مقارنةً {baseline} |
| `compare.yesterday_at` | yesterday at {time} | hier à {time} | بالأمس عند {time} |
| `compare.weekday_at` | last {weekday} at {time} | {weekday} dernier à {time} | بيوم {weekday} الماضي عند {time} |
| `compare.yesterday_same` | Yesterday at the same time | Hier à la même heure | الأمس في الوقت نفسه |
| `compare.weekday_same` | Last {weekday} at the same time | {weekday} dernier à la même heure | {weekday} الماضي في الوقت نفسه |
| `compare.none` | No comparison | Sans comparaison | بدون مقارنة |
| `compare.no_data` | No comparison yet | Pas encore de comparaison | لا مقارنة بعد |
| `home.orders` / `.avg_basket` / `.card_share` / `.returning` | Orders / Average basket / Card share / Returning | Commandes / Panier moyen / Part carte / Clients revenus | الطلبات / متوسط السلة / حصة البطاقة / الزبناء العائدون |
| `home.returning_value` (the line under the value; plural on `total`) | of {total} customers (one: of 1 customer) | sur {total} clients (one: sur 1 client) | من أصل {total} زبناء (one: من أصل زبون واحد · two: من أصل زبونين · many (11 to 99): من أصل {total} زبونًا · other (100+): من أصل {total} زبون) |
| `home.returning_a11y` (plural, as above) | {n} of {total} known customers came back today | n one: {n} client connu sur {total} est revenu aujourd'hui · other: {n} clients connus sur {total} sont revenus aujourd'hui | عاد اليوم {n} من أصل {total} زبناء معروفين (the noun after `{total}` follows the forms of `home.returning_value`) |
| `home.latest` | Latest orders | Dernières commandes | آخر الطلبات |
| `home.see_all_orders` (plural; AR invariant, §9.2; the last row of Latest orders) | See all {n} orders | Voir les {n} commandes | اعرض كل الطلبات ({n}) |
| `chart.show_data` | Show data | Afficher les données | اعرض البيانات |
| `chart.legend_today` | Today | Aujourd'hui | اليوم |
| `chart.legend_yesterday_at` (revision 6; replaces `.legend_baseline`) | Yesterday at {time} | Hier à {time} | الأمس عند {time} |
| `chart.legend_weekday_at` (revision 6) | Last {weekday} at {time} | {weekday} dernier à {time} | {weekday} الماضي عند {time} |
| `chart.empty` | No sales yet today | Aucune vente aujourd'hui | لا مبيعات اليوم بعد |
| `chart.summary_down` | Revenue today, {amount} at {time}, down {delta} on {baseline}. Busiest hour {hour}. | Chiffre d'affaires du jour : {amount} à {time}, en baisse de {delta} par rapport à {baseline}. Heure la plus active : {hour}. | إيرادات اليوم {amount} عند {time}، بانخفاض {delta} مقارنةً {baseline}. أكثر ساعة نشاطًا: {hour}. |
| `chart.summary_up` | Revenue today, {amount} at {time}, up {delta} on {baseline}. Busiest hour {hour}. | Chiffre d'affaires du jour : {amount} à {time}, en hausse de {delta} par rapport à {baseline}. Heure la plus active : {hour}. | إيرادات اليوم {amount} عند {time}، بارتفاع {delta} مقارنةً {baseline}. أكثر ساعة نشاطًا: {hour}. |
| `chart.summary_same` (revision 13, P9: a change that rounds to zero; no signed or unsigned "0" in a sentence) | Revenue today, {amount} at {time}, level with {baseline}. Busiest hour {hour}. | Chiffre d'affaires du jour : {amount} à {time}, au même niveau que {baseline}. Heure la plus active : {hour}. | إيرادات اليوم {amount} عند {time}، في المستوى نفسه مقارنةً {baseline}. أكثر ساعة نشاطًا: {hour}. |
| `chart.summary_none` | Revenue today, {amount} at {time}. Busiest hour {hour}. | Chiffre d'affaires du jour : {amount} à {time}. Heure la plus active : {hour}. | إيرادات اليوم {amount} عند {time}. أكثر ساعة نشاطًا: {hour}. |
| `kpi.margin` | Margin | Marge | الهامش |
| `kpi.margin_needs_costs` | Add dish costs to see margin. | Ajoutez le coût des plats pour voir la marge. | أضف تكلفة الأطباق لرؤية الهامش. |
| `kpi.add_costs` | Add dish costs | Ajouter le coût des plats | أضف تكلفة الأطباق |
| `menu.empty.title` | No dishes yet | Aucun plat pour l'instant | لا أطباق بعد |
| `menu.empty.body` | Add your dishes to sell them at the till. | Ajoutez vos plats pour les vendre en caisse. | أضف أطباقك لتبيعها في الصندوق. |
| `menu.empty.action` | Add a dish | Ajouter un plat | أضف طبقًا |
| `orders.summary` (plural; AR six forms: §9.2, order, nominative) | {n} orders · average basket {amount} | {n} commandes · panier moyen {amount} | {n} طلب · متوسط السلة {amount} |
| `orders.all` / `.card` / `.cash` / `.other` / `.refunds` (revision 23, P1: `.other` replaces the shipped Mobile filter, §18.2) | All / Card / Cash / Other / Refunds | Tout / Carte / Espèces / Autre / Remboursements | الكل / بطاقة / نقدًا / أخرى / المستردات |
| `orders.empty` | No orders yet today | Aucune commande aujourd'hui | لا طلبات اليوم بعد |
| `orders.load_failed` | Couldn't load orders | Impossible de charger les commandes | تعذّر تحميل الطلبات |
| `orders.empty_refunds` | No refunds today | Aucun remboursement aujourd'hui | لا مبالغ مستردة اليوم |
| `orders.refund_row` | {order} · {table} · Refund | {order} · {table} · Remboursement | {order} · {table} · استرداد |
| `orders.takeaway` | Takeaway | À emporter | للأخذ |
| `invoice.a4` (revision 23, M2: shipped "Facture A4" on the till, "Facture PDF" on the dashboard; one key for both places) | A4 invoice | Facture A4 | فاتورة A4 |
| `invoice.wait` (shipped) | Invoice available once the sale is synced | Facture disponible après synchronisation de la vente | الفاتورة متاحة بعد مزامنة البيع |
| `report.export` (revision 23, M2; shipped "Export") | Export | Exporter | صدّر |
| `export.printable` / `.sales` / `.day_report` | Printable report / Sales (CSV) / Detailed day report (CSV) | Rapport imprimable / Ventes (CSV) / Rapport journalier détaillé (CSV) | تقرير للطباعة / المبيعات (CSV) / التقرير اليومي المفصّل (CSV) |
| `customers.summary` | {known} · {contactable} can be contacted | {known} · {contactable} joignables | {known} · يمكن التواصل مع {contactable} |
| `customers.search` | Search name, phone or email | Rechercher un nom, un téléphone ou un e-mail | ابحث بالاسم أو الهاتف أو البريد الإلكتروني |
| `customers.add` | Add customer | Ajouter un client | أضف زبونًا |
| `customers.last_visit` | last visit {relative} | dernière visite {relative} | آخر زيارة {relative} |
| `customers.status.regular` / `.new` / `.inactive` | Regular / New / Inactive | Habitué / Nouveau / Inactif | دائم / جديد / غير نشط |
| `customers.segment.vip` (revision 23, P2: a segment, not a status; P5: Arabic is VIP, as the marker; shipped Arabic was كبار) | VIP | VIP | VIP |
| `customers.filter` | {status} {n} | {status} {n} | {status} {n} |
| `customers.all` | All | Tout | الكل |
| `customers.vip` (marker, spoken) | VIP | VIP | VIP |
| `customers.export` / `.loyalty` / `.campaign` (revision 23, M2: the shipped icon row, now the overflow; `clients-directory.js@319ac100:30-62`) | Export (CSV) / Loyalty program / Campaign | Exporter (CSV) / Programme de fidélité / Campagne | صدّر (CSV) / برنامج الوفاء / حملة |
| `ai.intro` | Answers come from {business}'s own records. Every figure links to its source. | Les réponses viennent des données de {business}. Chaque chiffre renvoie à sa source. | تأتي الإجابات من سجلات {business} نفسها. كل رقم مرتبط بمصدره. |
| `ai.how` | Read how Kiwi AI uses your data | Lire comment Kiwi AI utilise vos données | اقرأ كيف يستخدم Kiwi AI بياناتك |
| `ai.today` | Today at {time} | Aujourd'hui à {time} | اليوم عند {time} |
| `ai.try` | Try asking | Essayez de demander | جرّب أن تسأل |
| `ai.placeholder` (revision 23, M1: shortened to one line beside the mic, §18.6) | Ask about your sales | Posez une question sur vos ventes | اسأل عن مبيعاتك |
| `ai.send` (aria) | Send question | Envoyer la question | أرسل السؤال |
| `ai.error` | Couldn't reach Kiwi AI. Your question is kept. | Kiwi AI est injoignable. Votre question est conservée. | تعذّر الوصول إلى Kiwi AI. سؤالك محفوظ. |
| `ai.title` | Kiwi AI | Kiwi AI | Kiwi AI |
| `ai.today_down` (plural on `n`; AR six forms: §9.2, order, after من) | {amount} from {n} orders, {delta} less than yesterday at the same time. | {amount} sur {n} commandes, {delta} de moins qu'hier à la même heure. | {amount} من {n} طلب، أقل بمقدار {delta} من الأمس في الوقت نفسه. |
| `ai.today_up` (plural on `n`; AR six forms: §9.2, order, after من) | {amount} from {n} orders, {delta} more than yesterday at the same time. | {amount} sur {n} commandes, {delta} de plus qu'hier à la même heure. | {amount} من {n} طلب، أكثر بمقدار {delta} من الأمس في الوقت نفسه. |
| `ai.today_same` (revision 13, P9: a change that rounds to zero; plural on `n`; AR six forms: §9.2, order, after من) | {amount} from {n} orders, the same as yesterday at the same time. | {amount} sur {n} commandes, comme hier à la même heure. | {amount} من {n} طلب، مثل الأمس في الوقت نفسه. |
| `ai.source.sales_today` | Sales · today | Ventes · aujourd'hui | المبيعات · اليوم |
| `ai.suggest.restaurant` (revision 25, M1: rows 1 to 3 for a restaurant, a café and every trade without its own; the shipped Home chips `dash.hero.ai.chip1` to `.chip3`, EN and AR `assets/i18n.js@319ac100:214-216`, `:872-874`, FR `dashboard.html@319ac100:4986-4988`; the third question says "average basket" in EN and AR, the tile's name (`home.avg_basket`), where the shipped restaurant chip says "average check" and متوسّط تذكرتي, as the other trades' third question already does) | Which dish should I drop? / Tonight's sales forecast / Why is my average basket falling? | Quel plat retirer de ma carte ? / Prévision des ventes ce soir / Pourquoi mon panier moyen baisse ? | أي طبق أحذف من قائمتي؟ / توقّع مبيعات هذا المساء / لماذا ينخفض متوسط سلّتي؟ |
| `ai.suggest.boutique` (revision 25, M1: a shop, pressing and the other shop trades; `getVocab('aiChips')`, `assets/venues.js@319ac100:974-976`) | Which item is not selling? / Sales forecast this week / Why is my average basket falling? | Quel article ne se vend pas ? / Prévision des ventes cette semaine / Pourquoi mon panier moyen baisse ? | أي منتج لا يُباع؟ / توقّع المبيعات هذا الأسبوع / لماذا ينخفض متوسط سلّتي؟ |
| `ai.suggest.spa` (revision 25, M1: `venues.js@319ac100:997-999`) | Which service fills my quiet hours? / Revenue forecast this week / Why is my average basket falling? | Quelle prestation remplit mes creux ? / Prévision des encaissements cette semaine / Pourquoi mon panier moyen baisse ? | أي خدمة تملأ ساعات الركود؟ / توقّع المداخيل هذا الأسبوع / لماذا ينخفض متوسط سلّتي؟ |
| `ai.suggest.hotel` (revision 25, M1: `venues.js@319ac100:1020-1022`. In all four rows the FR has U+00A0 before "?", which §9.6's lint requires and the shipped strings lack, and the AR has no space before "؟", which the shop, spa and hotel strings have; nothing else changes) | How do I fill my empty rooms? / Arrivals forecast this week / Why is my average basket falling? | Comment remplir mes chambres vides ? / Prévision des arrivées cette semaine / Pourquoi mon panier moyen baisse ? | كيف أملأ غرفي الشاغرة؟ / توقّع الوصول هذا الأسبوع / لماذا ينخفض متوسط سلّتي؟ |
| `ai.unknown_costs` (revision 15, P8: حساب only for a bill or a Kiwi account) | I don't have dish costs yet, so I can't work out margin. Add them in Menu › Costs. | Je n'ai pas encore le coût des plats, donc je ne peux pas calculer la marge. Ajoutez-les dans Menu › Coûts. | لا تتوفر لديّ تكلفة الأطباق بعد، لذا لا يمكنني معرفة الهامش. أضفها من القائمة › التكاليف. |
| `ai.thinking` (aria) | Kiwi AI is answering | Kiwi AI répond | يجيب Kiwi AI |
| `ai.actions.title` (revision 23, M1: shipped "Action Center", `agent-action-center.js@319ac100:22-24`) | Action Center | Centre d'actions | مركز الإجراءات |
| `ai.actions.button` (revision 24, P2: the Action Center's visible label, shipped as `agent-action-center.js@319ac100:22-24`) | Actions | Actions | الإجراءات |
| `ai.actions.pending_a11y` (aria; revision 23, M1; revision 24, P2: it now starts with the visible label; an invariant count string, §9.2) | Actions, {n} to confirm | Actions, {n} à confirmer | الإجراءات، {n} بانتظار التأكيد |
| `ai.actions.subtitle` (shipped) | Every action waits for your decision and keeps its history. | Chaque action attend votre décision et garde son historique. | كل إجراء ينتظر موافقتك ويحتفظ بسجله. |
| `ai.actions.empty` (shipped) | No actions need review. | Aucune action à examiner. | لا توجد إجراءات للمراجعة. |
| `ai.actions.status.pending` / `.approved` / `.rejected` / `.failed` / `.undone` (shipped) | Pending approval / Completed / Rejected / Failed / Undone | À confirmer / Exécutée / Refusée / Échec / Annulée | بانتظار الموافقة / تم التنفيذ / مرفوض / فشل / تم التراجع |
| `ai.actions.confirm` / `.reject` / `.undo` (shipped in EN and FR; AR changed to imperatives, as every button) | Confirm / Reject / Undo action | Confirmer / Refuser / Annuler l'action | أكّد / ارفض / تراجع عن الإجراء |
| `ai.actions.reversible` / `.final` (shipped) | Reversible / Cannot be undone | Réversible / Sans annulation | قابل للتراجع / غير قابل للتراجع |
| `ai.actions.restored` (shipped) | Previous state restored | État précédent restauré | تمت استعادة الحالة السابقة |
| `ai.actions.expired` (shipped) | The proposal was renewed before confirmation. | La proposition a été renouvelée avant confirmation. | تم تجديد الاقتراح قبل التأكيد. |
| `ai.voice.dictate` / `.stop` / `.busy` (aria; revision 23, M1; `.stop` changed from the shipped "Stop and send", because the text lands in the field and is not sent) | Dictate your question / Stop dictation / Transcribing | Dicter votre question / Arrêter la dictée / Transcription en cours | أملِ سؤالك / أوقف الإملاء / جارٍ التفريغ |
| `ai.voice.auth` (a 401; changed: the shipped line adds that the demo does not transcribe, which an expired session on a real account is not) | Dictation needs a signed-in Kiwi account. | La dictée demande un compte Kiwi connecté. | الإملاء يتطلب حساب Kiwi مسجّل الدخول. |
| `ai.voice.fallback` (a 503 `unbound` or a 429 `quota`, with browser recognition) | Kiwi transcription is unavailable, so this device's dictation takes over. Try again. | La transcription Kiwi est indisponible, la dictée de cet appareil prend le relais. Réessayez. | تفريغ Kiwi غير متاح، لذا يتولى الإملاء في هذا الجهاز المهمة. أعد المحاولة. |
| `ai.voice.down` | Transcription is unavailable right now. | Transcription indisponible pour le moment. | التفريغ غير متاح حاليًا. |
| `ai.voice.denied` | Microphone blocked. Allow it in Settings › Kiwi Pro. | Micro refusé. Autorisez-le dans Réglages › Kiwi Pro. | الميكروفون محظور. اسمح به في الإعدادات › Kiwi Pro. |
| `ai.voice.nothing` | Nothing heard. Try again closer to the microphone. | Rien entendu. Réessayez plus près du micro. | لم يُسمع شيء. أعد المحاولة قرب الميكروفون. |
| `ai.voice.failed` | Transcription failed. Try again. | La transcription a échoué. Réessayez. | فشل التفريغ. أعد المحاولة. |
| `ai.voice.offline` | Offline. Dictation needs the network. | Hors ligne. La dictée a besoin du réseau. | غير متصل. الإملاء يحتاج إلى الشبكة. |
| `ai.voice.unavailable` | Dictation is not available on this device. | La dictée n'est pas disponible sur cet appareil. | الإملاء غير متاح على هذا الجهاز. |
| `ai.voice.interrupted` | Dictation stopped. Try again. | Dictée interrompue. Réessayez. | توقف الإملاء. أعد المحاولة. |
| `ai.calculator` / `ai.attach` (revision 23, M1; shipped "Calculator"; AR `ai.attach` an imperative) | Calculator / Attach | Calculatrice / Joindre | الآلة الحاسبة / أرفق |
| `ai.calculator.use` (shipped) | Use this result | Utiliser ce résultat | استعمل هذه النتيجة |
| `ai.attach_a11y` (aria) | Attach a photo or a PDF | Joindre une photo ou un PDF | أرفق صورة أو ملف PDF |
| `ai.follow.breakeven` / `.forecast` / `.charges` (revision 25, P12: the shipped follow-up chips, `chips` in `agent.js@319ac100:404-409`, `:576-581`, `:747-752`) | What is my break-even point? / Profit forecast this month / Break down my costs | Quel est mon seuil de rentabilité ? / Prévision de bénéfice ce mois / Décompose mes charges | ما هي نقطة التعادل لدي؟ / توقّع الربح هذا الشهر / حلّل تكاليفي |
| `ai.follow.invest` (revision 25, P12: the shipped `invest80` and `invest150`; `{amount}` is `KiwiFormat.money`, whole, 80,000 or 150,000, so AR says درهم where the shipped string wrote "MAD") | Can I invest {amount}? | Puis-je investir {amount} ? | هل يمكنني استثمار {amount}؟ |
| `ai.suggest.hire` (revision 23, M1: the shipped "Simulate a hire" card's question) | Can I hire a waiter? | Puis-je embaucher un serveur ? | هل يمكنني توظيف نادل؟ |
| `ai.suggest.features` / `.setup` (revision 23, M1: the shipped new-store cards' questions, rows 4 and 5 for a store whose costs are not set up) | Which Kiwi features do I have? / Help me configure my business | Quelles fonctions Kiwi ai-je ? / Aide-moi à configurer mon établissement | ما هي وظائف Kiwi المتاحة؟ / ساعدني في إعداد مؤسستي |
| `ai.suggest.price_rise` (the shipped "Test a price rise" card's question; revision 24, P4: `{pct}` is `KiwiFormat.share(0.05)`, unsigned and whole, `5%` in EN and `5⍽%` in FR and AR (§6.3), as the shipped question says "5%" (`agent.js@319ac100:577`); `pct` would sign it and keep a decimal, "+5.0%") | What if I raise my prices by {pct}? | Et si j'augmente mes prix de {pct} ? | ماذا لو رفعت أسعاري بنسبة {pct}؟ |
| `ai.suggest.ops.restaurant` / `.pressing` / `.boutique` / `.other` (revision 24, P8: the question of the shipped operational start card, row 6 for a store whose costs are not set up; `OPS_HERO`, `agent.js@319ac100:1460-1463`, as shipped) | How many tables are free or occupied now? / How many pressing orders are ready or late? / What is the inventory status now? / Which operational data is available now? | Combien de tables sont libres ou occupées maintenant ? / Combien de commandes pressing sont prêtes ou en retard ? / Quel est l'état du stock maintenant ? / Quelles données opérationnelles sont disponibles maintenant ? | كم طاولة حرة أو مشغولة الآن؟ / كم طلب مصبنة جاهز أو متأخر؟ / ما حالة المخزون الآن؟ / ما بيانات التشغيل المتاحة الآن؟ |
| `ai.insight.eyebrow` / `.measured` / `.estimated` (revision 24, M2: the first card's eyebrow when it shows a lever, and the lever's basis, shipped `insights.js@319ac100:36-40`; joined by a middle dot) | Kiwi Insights / Measured / Estimated | Kiwi Insights / Mesuré / Estimé | Kiwi Insights / مقاس / تقديري |
| `settings.lift_pause` (**rendered only once `POST /api/pin/unlock` ships**, §23.8) | Lift the code pause | Lever la pause des codes | ارفع إيقاف الرموز |
| `settings.lift_pause_body` | Wrong tries paused every code on {venue}'s tills until {time}. Lift the pause now? | Des essais incorrects ont mis en pause tous les codes des caisses de {venue} jusqu'à {time}. Lever la pause maintenant ? | أوقفت المحاولات الخاطئة جميع رموز صناديق {venue} حتى {time}. هل تريد رفع الإيقاف الآن؟ |

**Kitchen (`kds`)**

| Key | EN | FR | AR |
| --- | --- | --- | --- |
| `kds.new` / `.preparing` / `.ready` | New / Preparing / Ready | Nouveau / En préparation / Prêt | جديد / قيد التحضير / جاهز |
| `kds.start` | Start | Commencer | ابدأ |
| `kds.mark_ready` | Mark ready | Marquer prêt | علّم كجاهز |
| `kds.mark_served` | Mark served | Marquer servi | علّم كمُقدَّم |
| `kds.late` | Late | En retard | متأخر |
| `kds.live` | Live | En direct | مباشر |
| `kds.no_new` | No new orders | Aucune nouvelle commande | لا طلبات جديدة |
| `kds.newer` | +{n} newer | +{n} plus récentes | +{n} أحدث |
| `kds.items` (plural; AR six forms: §9.2, item, nominative) | {n} items | {n} articles | {n} صنف |
| `kds.voided` | Voided | Annulé | أُلغي |
| `kds.not_saved` | Not saved. Tap to try again. | Non enregistré. Touchez pour réessayer. | لم يُحفظ. اضغط للمحاولة مجددًا. |
| `kds.announce` | New order {n}, {source} | Nouvelle commande {n}, {source} | طلب جديد {n}، {source} |
| `kds.station` | {station} {n} | {station} {n} | {station} {n} |
| `kds.all` / `kds.station.hot` / `.cold` / `.pastry` / `.drinks` (merchant-named stations are fixture data) | All / Hot / Cold / Pastry / Drinks | Tout / Chaud / Froid / Pâtisserie / Boissons | الكل / ساخن / بارد / حلويات / مشروبات |
| `kds.menu.history` | History | Historique | السجل |
| `kds.menu.stations` | Stations | Postes | المحطات |
| `kds.menu.display` | Display | Affichage | العرض |
| `kds.menu.text_size` | Text size | Taille du texte | حجم النص |
| `kds.size.small` / `.medium` / `.large` | Small / Medium / Large | Petite / Moyenne / Grande | صغير / متوسط / كبير |
| `kds.menu.sound` | Sound | Son | الصوت |
| `kds.menu.input` | Input | Saisie | الإدخال |
| `kds.input.touch` / `.bump` / `.readonly` | Touch / Bump bar / Read-only wall | Tactile / Clavier de rappel / Écran mural en lecture seule | لمس / لوحة التمرير / شاشة عرض فقط |
| `kds.compressed` (plural; AR six forms: §9.2, item, nominative) | {n} items | {n} articles | {n} صنف |
| `kds.newer_open` | Show newer orders | Voir les commandes plus récentes | اعرض الطلبات الأحدث |
| `kds.no_preparing` | Nothing cooking | Aucun plat en cours | لا يوجد طبق قيد التحضير |
| `kds.no_ready` | The pass is clear | Le passe est vide | لا شيء في انتظار التقديم |
| `kds.loading` | Loading orders | Chargement des bons | جارٍ تحميل الطلبات |
| `kds.down` | Server unreachable. Orders will appear when the network is back. | Serveur injoignable. Les bons s’afficheront au retour du réseau. | تعذّر الوصول إلى الخادم. ستظهر الطلبات عند عودة الشبكة. |
| `kds.source.table` | Table {table} | Table {table} | طاولة {table} |
| `kds.source.takeaway` | Takeaway | À emporter | للأخذ |
| `kds.source.delivery` | Delivery | Livraison | توصيل |
| `kds.suite` | Next course | Suite | الطبق التالي |
| `kds.following` | To follow: {items} | À suivre : {items} | يتبع: {items} |
| `kds.recall` | Back to the kitchen | Rappeler en cuisine | إرجاع إلى المطبخ |
| `kds.station_done` | Station done | Poste prêt | المركز جاهز |
| `kds.ready_at` | Ready at {time} | Prêt à {time} | جاهز في {time} |
| `kds.sync_pending` | Not synced yet | Pas encore synchronisé | لم تتم المزامنة بعد |
| `kds.void.title` | Cancelled: {line} ({reason}) | Annulé : {line} ({reason}) | إلغاء: {line} ({reason}) |
| `kds.void.accept` | Stop cooking | Arrêter la préparation | أوقف التحضير |
| `kds.void.reject` | Already plated | Déjà dressé | جاهز مسبقًا |
| `kds.void.reason.client_change` | Customer changed | Changement client | تغيير من الزبون |
| `kds.void.reason.order_error` | Entry error | Erreur de saisie | خطأ في الإدخال |
| `kds.void.reason.kitchen_waste` | Kitchen waste | Perte cuisine | هدر في المطبخ |
| `kds.void.reason.quality_return` | Quality return | Retour qualité | إرجاع لعيب |
| `kds.void.reason.other` | Cancelled | Annulation | إلغاء |
| `kds.void.not_confirmed` | The server did not confirm the cancellation. Check the connection and try again. | Le serveur n’a pas confirmé l’annulation. Vérifiez la connexion et réessayez. | لم يؤكد الخادم الإلغاء. تحقق من الاتصال وأعد المحاولة. |
| `kds.recipe` | Recipe for {item} | Recette de {item} | وصفة {item} |

**Onboarding (`onboarding`)**

| Key | EN | FR | AR |
| --- | --- | --- | --- |
| `ob.welcome` | Run your business with Kiwi | Gérez votre commerce avec Kiwi | أدِر نشاطك التجاري مع Kiwi |
| `ob.create` (revision 15, P8) | Create an account | Créer un compte | أنشئ حساب Kiwi |
| `ob.signin` | Sign in | Se connecter | سجّل الدخول |
| `ob.name` | Your name | Votre nom | اسمك |
| `ob.business` | Business name | Nom du commerce | اسم النشاط التجاري |
| `ob.email` | E-mail | E-mail | البريد الإلكتروني |
| `ob.password` | Password | Mot de passe | كلمة المرور |
| `ob.show_password` (aria) | Show password | Afficher le mot de passe | أظهر كلمة المرور |
| `ob.forgot` (the shipped gate's link, `functions/_middleware.js:707, 719, 731`) | Forgot your password? | Mot de passe oublié ? | نسيت كلمة المرور؟ |
| `ob.wrong_password` | That e-mail and password don't match. | Cet e-mail et ce mot de passe ne correspondent pas. | البريد الإلكتروني وكلمة المرور غير متطابقين. |
| `ob.pw.rules` (helper, visible before submit) | At least 10 characters. Avoid common passwords and your e-mail or business name. | Au moins 10 caractères. Évitez les mots de passe courants, votre e-mail et le nom de votre commerce. | 10 أحرف على الأقل. تجنّب كلمات المرور الشائعة وبريدك الإلكتروني واسم نشاطك التجاري. |
| `ob.err.email` (400 `email`) | Enter a valid e-mail address. | Saisissez une adresse e-mail valide. | أدخل عنوان بريد إلكتروني صالحًا. |
| `ob.err.name` (400 `name`) | Enter your name. | Saisissez votre nom. | أدخل اسمك. |
| `ob.err.pw_short` (400 `weak`, `short`) | Use at least 10 characters. | Utilisez au moins 10 caractères. | استخدم 10 أحرف على الأقل. |
| `ob.err.pw_long` (400 `weak`, `long`) | Use 1,024 characters or fewer. | Utilisez 1 024 caractères au maximum. | استخدم 1024 حرفًا أو أقل. |
| `ob.err.pw_common` (400 `weak`, `common`) | This password is too easy to guess. Choose another. | Ce mot de passe est trop facile à deviner. Choisissez-en un autre. | كلمة المرور هذه سهلة التخمين. اختر غيرها. |
| `ob.err.pw_personal` (400 `weak`, `personal`) | Don't use your e-mail or business name in the password. | N'utilisez pas votre e-mail ni le nom de votre commerce dans le mot de passe. | لا تستخدم بريدك الإلكتروني أو اسم نشاطك التجاري في كلمة المرور. |
| `ob.exists` (409 `exists`, copy #6) | This e-mail already has an account. Sign in instead. | Cet e-mail a déjà un compte. Connectez-vous. | هذا البريد مرتبط بحساب Kiwi. سجّل الدخول بدلاً من ذلك. |
| `ob.err.business_taken` (409 `business-taken`) | A business with this name already uses Kiwi. Add your city or area to the name. | Un commerce de ce nom utilise déjà Kiwi. Ajoutez votre ville ou votre quartier au nom. | يستخدم Kiwi نشاط تجاري بهذا الاسم. أضف مدينتك أو حيّك إلى الاسم. |
| `ob.err.rate` (sign-up 429; the sign-up limiter is keyed by network only, `signup.js:20`) | Too many attempts from this network. Try again in {minutes} min. | Trop de tentatives depuis ce réseau. Réessayez dans {minutes} min. | محاولات كثيرة من هذه الشبكة. حاول بعد {minutes} د. |
| `ob.unavailable` (sign-up 503, and the unreachable 400 `bad-json`) | Sign-up isn't available right now. Try again in a moment. | L'inscription n'est pas disponible pour l'instant. Réessayez dans un instant. | التسجيل غير متاح الآن. حاول بعد لحظات. |
| `ob.err.signin_rate` (sign-in 429, keyed by network **and** by account, `login.js:29-33`) | Too many attempts. Try again in {minutes} min. | Trop de tentatives. Réessayez dans {minutes} min. | محاولات كثيرة. حاول بعد {minutes} د. |
| `ob.signin_unavailable` (sign-in 503 `not-configured`, `auth-unavailable`, `rate-limit-unavailable`; the unreachable 400 `bad-json`) | Sign-in isn't available right now. Try again in a moment. | La connexion n'est pas disponible pour l'instant. Réessayez dans un instant. | تسجيل الدخول غير متاح الآن. حاول بعد لحظات. |
| `ob.forgot.title` | Forgot your password? | Mot de passe oublié ? | نسيت كلمة المرور؟ |
| `ob.forgot.body` | Enter the e-mail address of your account. We'll send you a link to choose a new password. | Saisissez l'adresse e-mail de votre compte. Nous vous enverrons un lien pour choisir un nouveau mot de passe. | أدخل البريد الإلكتروني لحساب Kiwi الخاص بك. سنرسل إليك رابطًا لاختيار كلمة مرور جديدة. |
| `ob.forgot.send` | Send the link | Envoyer le lien | أرسل الرابط |
| `ob.forgot.rate` (429 on `/auth/forgot`, keyed by network and by address) | Too many requests. Try again in a few minutes. | Trop de demandes. Réessayez dans quelques minutes. | طلبات كثيرة. حاول مرة أخرى بعد بضع دقائق. |
| `ob.forgot.unavailable` (503 `not-configured` or `rate-limit-unavailable`) | Reset isn't available right now. Try again in a moment. | La réinitialisation n'est pas disponible pour l'instant. Réessayez dans un instant. | إعادة التعيين غير متاحة الآن. حاول بعد لحظات. |
| `ob.forgot.sent_title` (200, `mail: true`) | Check your inbox | Vérifiez votre boîte mail | تحقّق من بريدك |
| `ob.forgot.sent_body` | If a Kiwi account uses this address, a link to reset the password is on its way. It works once and expires after one hour. Check your spam folder too. | Si un compte Kiwi utilise cette adresse, un lien de réinitialisation est en route. Il fonctionne une fois et expire au bout d'une heure. Pensez aussi aux courriers indésirables. | إذا كان حساب Kiwi يستخدم هذا البريد، فرابط إعادة التعيين في الطريق. يعمل مرة واحدة وتنتهي صلاحيته بعد ساعة. تحقّق أيضًا من البريد غير الهام. |
| `ob.forgot.no_mail_title` (200, `mail: false`: no `MAIL_WEBHOOK`) | Contact us to reset it | Contactez-nous pour réinitialiser | تواصل معنا لإعادة التعيين |
| `ob.forgot.no_mail_body` | Kiwi can't send e-mail from here yet. Contact support and we'll send the link to your account's e-mail address, and only to that one. | Kiwi ne peut pas encore envoyer d'e-mail d'ici. Contactez le support : nous enverrons le lien à l'adresse e-mail de votre compte, et uniquement à celle-ci. | لا يستطيع Kiwi إرسال البريد من هنا بعد. تواصل مع الدعم وسنرسل الرابط إلى بريد حساب Kiwi الخاص بك فقط. |
| `ob.forgot.support` | Contact support | Contacter le support | تواصل مع الدعم |
| `ob.forgot.back` | Back to sign in | Retour à la connexion | العودة إلى تسجيل الدخول |
| `ob.reset.checking` | Checking the link | Vérification du lien | جارٍ التحقق من الرابط |
| `ob.reset.dead_title` (GET or POST `/auth/reset` answers `invalid`; revision 8: true for a database fault too) | This link can't be used | Ce lien ne peut pas servir | لا يمكن استخدام هذا الرابط |
| `ob.reset.dead_body` (revision 8) | It may have been used already, or expired after its hour, or Kiwi couldn't check it just now. A new link works in every case. | Il a peut-être déjà servi, ou expiré au bout d'une heure, ou Kiwi n'a pas pu le vérifier à l'instant. Un nouveau lien marche dans tous les cas. | ربما استُخدم من قبل، أو انتهت صلاحيته بعد ساعة، أو تعذّر على Kiwi التحقق منه الآن. الرابط الجديد يعمل في كل الحالات. |
| `ob.reset.again` | Get a new link | Recevoir un nouveau lien | احصل على رابط جديد |
| `ob.reset.again_hint` (revision 7; shown only when this device remembers the address) | We'll send it to the address you entered on this device. | Nous l'enverrons à l'adresse saisie sur cet appareil. | سنرسله إلى العنوان الذي أدخلته على هذا الجهاز. |
| `ob.reset.used_body` (revision 7, M2; revision 8: only for a 500 without `retry`, when the token stayed spent) | Your password wasn't changed, and this link can't be used again. Get a new link to try once more. | Votre mot de passe n'a pas été modifié, et ce lien ne peut plus servir. Recevez un nouveau lien pour réessayer. | لم تتغيّر كلمة مرورك، ولا يمكن استخدام هذا الرابط مرة أخرى. احصل على رابط جديد لتحاول من جديد. |
| `ob.reset.title` | Choose a new password | Choisissez un nouveau mot de passe | اختر كلمة مرور جديدة |
| `ob.reset.new` / `ob.reset.confirm` (field labels) | New password / Confirm the new password | Nouveau mot de passe / Confirmez le nouveau mot de passe | كلمة المرور الجديدة / أكّد كلمة المرور الجديدة |
| `ob.reset.differ` (client check) | The two passwords don't match. | Les deux mots de passe ne correspondent pas. | كلمتا المرور غير متطابقتين. |
| `ob.reset.save` | Save the new password | Enregistrer le mot de passe | احفظ كلمة المرور الجديدة |
| `ob.reset.failed` (revision 8: on Save, the 503 `not-configured`, 400 `bad-json`, and 500 `update-failed` with `retry: true`; the link still works in all three. Revision 9, P1: never on R4, where no password has been entered yet; R4 uses `ob.reset.check_failed`) | Your password wasn't changed. Try again. | Votre mot de passe n'a pas été modifié. Réessayez. | لم تتغيّر كلمة مرورك. حاول مرة أخرى. |
| `ob.reset.done` | Password saved. You're signed in. | Mot de passe enregistré. Vous êtes connecté. | حُفظت كلمة المرور. تم تسجيل دخولك. |
| `ob.reset.check_failed` (revision 9, P1: R4 only, the 503 from `GET /auth/reset` while the link is checked, `reset.js:71`, before any password is entered) | Couldn't check this link. Try again. | Impossible de vérifier ce lien. Réessayez. | تعذّر التحقق من هذا الرابط. حاول مرة أخرى. |
| `ob.reset.rate` (429 on `/auth/reset`, revision 6) | Too many attempts from this network. | Trop de tentatives depuis ce réseau. | محاولات كثيرة من هذه الشبكة. |
| `ob.reset.retry_in` (live countdown; `{n}` minutes, rounded up) | Try again in {n} min | Réessayez dans {n} min | حاول مجددًا بعد {n} د |
| `ob.offline` (network, on sign-up, sign-in and the reset request) | No connection. Your details are kept. Try again when you're online. | Pas de connexion. Vos informations sont conservées. Réessayez une fois en ligne. | لا يوجد اتصال. بياناتك محفوظة. حاول مجددًا عند الاتصال. |
| `ob.step` | Step {n} of {total} | Étape {n} sur {total} | الخطوة {n} من {total} |
| `ob.kind` | What kind of business? | Quel type de commerce ? | ما نوع نشاطك التجاري؟ |
| `ob.goals` (revision 24, M2: the shipped goals step, `assets/onboarding.js@319ac100:437-452`) | What matters most to you? | Qu'est-ce qui compte le plus ? | ما الأهم بالنسبة لك؟ |
| `ob.goals_sub` | Pick what matters to you, and Kiwi puts the right tools first. Choose as many as you like. | Choisissez ce qui compte pour vous, Kiwi met en avant les bons outils. Plusieurs choix possibles. | اختر ما يهمك، وسيضع Kiwi الأدوات المناسبة في المقدمة. يمكنك اختيار أكثر من واحد. |
| `ob.goal.sales` / `.time` / `.theft` / `.margins` / `.stock` / `.loyalty` / `.remote` / `.multi` (the shipped `GOALS`, `onboarding.js@319ac100:73-82`, with "and" for "&") | Grow my sales / Save time / Cut losses and theft / Understand my margins / Manage my stock / Keep customers loyal / Manage remotely / Run multiple locations | Augmenter mes ventes / Gagner du temps / Réduire les pertes et le vol / Comprendre mes marges / Mieux gérer mon stock / Fidéliser mes clients / Piloter à distance / Gérer plusieurs points de vente | زيادة مبيعاتي / توفير الوقت / تقليل الخسائر والسرقة / فهم هوامشي / إدارة مخزوني / كسب ولاء الزبناء / الإدارة عن بعد / إدارة عدة نقاط بيع |
| `ob.daily_goal` (the field's label) | Daily goal (optional) | Objectif journalier (facultatif) | الهدف اليومي (اختياري) |
| `ob.err.goal` (shipped check, `onboarding.js@319ac100:577-585`, `:591`) | Enter a positive amount with at most two decimal places. | Saisissez un montant positif, avec au plus deux décimales. | أدخل مبلغًا موجبًا بمنزلتين عشريتين على الأكثر. |
| `ob.other_kinds` | Show other types | Voir les autres types | اعرض أنواعًا أخرى |
| `ob.code` | Your personal code | Votre code personnel | رمزك الشخصي |
| `ob.code_sub` | It unlocks your dashboard. Your team gets their own codes later in Team. | Il déverrouille votre tableau de bord. Votre équipe recevra ses propres codes dans Équipe. | يفتح لوحة التحكم. سيحصل فريقك على رموزه لاحقًا من قسم الفريق. |
| `ob.code_again` | Enter it again to confirm | Saisissez-le à nouveau pour confirmer | أدخله مرة أخرى للتأكيد |
| `ob.code_mismatch` | The two codes don't match. Start again. | Les deux codes ne correspondent pas. Recommencez. | الرمزان غير متطابقين. ابدأ من جديد. |
| `ob.device` | Set up this device | Configurer cet appareil | إعداد هذا الجهاز |
| `ob.device.till` | Run the till here | Utiliser la caisse ici | شغّل الصندوق هنا |
| `ob.device.kds` | Use as kitchen screen | Utiliser comme écran cuisine | استخدمه كشاشة مطبخ |
| `ob.device.team` | Use as team device | Utiliser comme appareil d'équipe | استخدمه كجهاز للفريق |
| `ob.device.dashboard` | Use the dashboard only | Utiliser le tableau de bord uniquement | استخدم لوحة التحكم فقط |
| `ob.kds_warning` | This device signs out of your account and becomes a kitchen screen. | Cet appareil se déconnecte de votre compte et devient un écran cuisine. | سيُسجَّل خروج هذا الجهاز من حساب Kiwi الخاص بك ويصبح شاشة مطبخ. |
| `ob.team_warning` | This device signs out of your account. Each person signs in with their own e-mail and code. | Cet appareil se déconnecte de votre compte. Chaque personne se connecte avec son e-mail et son code. | سيُسجَّل خروج هذا الجهاز من حساب Kiwi الخاص بك. يسجّل كل شخص دخوله ببريده ورمزه. |
| `ob.printer` | Connect a printer | Connecter une imprimante | وصّل طابعة |
| `ob.later` | Set up later | Configurer plus tard | الإعداد لاحقًا |
| `ob.finish` | Start using Kiwi | Commencer avec Kiwi | ابدأ استخدام Kiwi |

**Guest ordering (`ordering`)**

| Key | EN | FR | AR |
| --- | --- | --- | --- |
| `ordering.basic` | This browser can't place orders here. Show this menu to the staff to order. | Ce navigateur ne permet pas de commander ici. Montrez ce menu au personnel pour commander. | لا يتيح هذا المتصفح الطلب هنا. اعرض هذه القائمة على الموظفين للطلب. |

---

**Guest pages: shipped strings that promised a vibration (rewritten in revision 6).** §20.3 removes the guest pages' `navigator.vibrate` calls (`OrderPro.html:5990`, `kiwi-order.html:5233` and `:5239`), so the copy that promises one goes too. These live in each page's own dictionary (the guest pages do not use `assets/i18n.js`), with the FR default also in the HTML; the Arabic is Darija, as the pages' existing Arabic is. Both pages keep their chime and their system notification, so the new copy promises exactly those, and says the chime needs the page open (a background tab cannot play it):

| Key and site | EN | FR (also the HTML default) | AR (Darija) |
| --- | --- | --- | --- |
| `prep_note_post`, `OrderPro.html` (EN `:3998`, FR `:3812` and the HTML at `:3300`, AR `:4181`) | . A notification tells you the moment it's ready, with a chime while this page is open. | . Une notification vous prévient dès que c'est prêt, avec un son tant que cette page est ouverte. | . غادي يوصلك إشعار ملي يكون واجد، مع صوت إلا كانت هاد الصفحة محلولة. |
| `prep_note_post`, `kiwi-order.html` (EN `:3420`, FR `:3225` and the HTML at `:2813`, AR `:3615`) | . It chimes the moment it's ready, as long as this page stays open. | . Elle sonne dès que c'est prêt, tant que cette page reste ouverte. | . غادي تصوّت ملي يكون واجد، إلا بقات هاد الصفحة محلولة. |
| `prep_perm_denied`, both pages (`OrderPro.html` EN `:3993`, FR `:3807`, AR `:4176`; `kiwi-order.html` EN `:3415`, FR `:3220`, AR `:3610`) | Notifications are off. Keep this page open and it will chime when your order is ready. | Notifications désactivées. Gardez cette page ouverte : elle sonnera quand votre commande sera prête. | الإشعارات مسدودة. خلّي هاد الصفحة محلولة وغادي تصوّت ملي تكون الطلبية واجدة. |

`guest-copy-test` (stage 1, with the vibrate removal) fails if any guest dictionary value or HTML default contains "vibr", "vibrate", "يهز" or "تهز", so a promise of a vibration cannot come back without the vibration.

## 10. Kit components

### 10.0 Rules for every component
- **Isolation:** shadow-DOM custom elements under the host contract in §20.2 (`:host` resets with an explicit inherit list). Tokens arrive as inherited custom properties.
- **Hit area:** at least 44 × 44, even when the visual is smaller. **Separate controls are ≥ 8 apart.** Members of one contiguous control (list rows in one group, segments, tab capsule items, keypad keys, date cells) may abut and carry the same `data-k-group` id (Principle 4). The target audit measures hit rectangles, not visuals.
- **Focus:**
  - `:focus-visible` draws the ring as `box-shadow: 0 0 0 2px var(--k-bg), 0 0 0 4px var(--k-focus)`, which follows the border radius on every WebKit version (an `outline` follows it only from iOS 16.4). An `outline: 2px solid transparent` is set too, so forced-colors modes still show a ring.
  - **Inside** tracks, keypads and tile grids the ring is inset (`box-shadow: inset 0 0 0 2px var(--k-focus)`), so it is never clipped.
  - Script-moved focus draws no ring.
  - Pages served to guests' own browsers add a **separate** `:focus { … }` rule and a separate `:focus:not(:focus-visible) { box-shadow: none }` rule. They are never combined into one selector list, so an engine without `:focus-visible` drops only that rule and keeps a ring (§4.1).
  - Increase Contrast makes the ring 3 px (§16).
- **Native controls inside:** every interactive part is a native `<button>`, `<input>` or `<label>` inside the component's own shadow root. Labels, descriptions and the elements they point to are in the **same** root, because ID references cannot cross a shadow boundary (§20.4).
- **Labels:** every label comes from keys; every icon-only control has an `aria-label`.
- **Before upgrade:** `:not(:defined)` placeholders take the **host** height of the element's declared size, so there is no layout shift on upgrade. For example `k-segmented:not(:defined){display:block;min-height:44px}` covers compact (a 36 visual inside 4 px of host padding, so a 44 host) and default (44), and `k-segmented[size="kitchen"]:not(:defined){min-height:56px}` covers the kitchen. Each component's table lists its host heights; `kit-lint` checks that every size has a placeholder rule.
- **States:** each table below lists rest, pressed, focus, disabled, loading, error and empty, plus states specific to the component.
- **Haptics** are listed per component by class name; when and how each class fires is defined once, in §15.

### 10.1 Buttons

**Anatomy:** capsule; optional leading 20 icon with an 8 gap; label. Amounts are part of the keyed label ("Charge 230.00 MAD"), never a second slot.

| Size | min-height | Inline padding | Label | Used for |
| --- | --- | --- | --- | --- |
| L | 56 | 20 | Body strong | Phone primaries, bill primary |
| M | 44 | 16 | Body strong | Default |
| S | 36, hit 44 | 12 | Callout strong | Desktop toolbars only |
| K | 64 | 24 | Body strong at the kitchen root | Kitchen |

**Width and wrap rule:**
- A button is either **full width** in its container (L primaries, the bill's secondary row halves) or **sized to its content** (padding + icon + gap + label). It never has a fixed width in px.
- **At text-size factor ≤ 1 every label fits on one line**, with its icon, at the **narrowest container it appears in**, in EN, FR and AR, measured in the shipped faces, Inter Tight for Latin (§6.1) and Plex Arabic (at its 108 % `size-adjust`) for Arabic. §6.6 lists every one-line label with its measured width and budget; `label-fit-test` re-measures them from the strings bundles on every capture run and fails on the first overflow.
- **Above factor 1:** first the icon drops, then the label wraps to at most **2 lines**, centred, and the button grows (its height is a min-height). It never truncates and never shrinks the type. A label that would need 3 lines at factor 1.35 is a copy bug and fails the same test.
- Copy is fitted to the container, not the other way round: when a label did not fit, revision 5 shortened it (§6.6 shows the before and after).

| Variant | Fill / label | Where |
| --- | --- | --- |
| Primary | accent / on-accent | The main task of a layer (≤ 1 per layer) |
| Primary icon | 44 accent circle / on-accent icon 24, `aria-label` required | The one primary of a layer whose task is a single glyph: Kiwi AI's send. It counts as the layer's primary |
| Secondary | surface-2 / ink-1 | Alternatives |
| Item | surface-2 light, surface-3 dark / ink-1 strong with a leading icon | Per-item actions inside `[data-k-collection]` (ticket Start, Mark ready, Mark served; Hand over on a takeaway card) |
| Tonal danger | danger-tint / danger | Destructive triggers, §11 |
| Danger solid | danger-solid / on-danger | **Only** the confirm button of a Tier B or C sheet |
| Plain | none / accent-ink, at the step of its context (`step="footnote"` or `step="body"`), hit 44 | Inline links (`team.edit_email`, `count.enter_total`, `ob.forgot`) |
| Icon | none / ink-1, 44 circle | Nav bar and toolbars. One style everywhere |

| State | Behaviour |
| --- | --- |
| Rest | As above |
| Pressed | Scale 0.97 over `--k-dur-1` (90) glide; fill to accent-pressed or surface-3; release on spring `--k-dur-4` (310) |
| Focus | Ring per §10.0 |
| Disabled | The internal `<button disabled>` (the host reflects its `disabled` attribute to it, because a `disabled` attribute on an autonomous element does nothing natively); fill surface-3, label ink-3 (exempt, 4.13 / 4.03); no haptic. The reason is a Footnote rendered **inside the same root** from the `reason` attribute and linked by `aria-describedby` |
| Loading | Width unchanged. After 300 ms a 20 px spinner appears at the start of the label group (on buttons with an icon it replaces the icon). `aria-busy="true"`; repeat taps ignored |
| Error | The button returns to rest; an inline danger message (Footnote strong) appears directly above it, inside the same root |
| Empty | n/a |

### 10.2 PIN pad (one component, eight uses)

| Use | Before entry | Length | Server call | What the pad shows after success |
| --- | --- | --- | --- | --- |
| Dashboard lock | The business name and "Dashboard locked" (`pin.dashboard_locked`). **No avatar and no name**, because `verifyAccountPin` accepts any person whose role opens the dashboard, not only the owner (`_lib.js:1405-1436`) | 4 | `POST /api/pin/verify {pin}` → `verifyAccountPin`, **asked first for every code typed** (shipped; a proven code's salted row is read only when the server cannot answer, the dashboard block below). A Face ID unlock, as designed, asks the server first too; shipped, it asks nothing (revision 21, M5: the block's Face ID row) | `pin.hello` with the returned `staff.name` |
| Till lock | Venue name only | 4 | `POST /api/pin/verify {merchant, pin}` → `verifyStaffPin(…, {requireTill:true})`. `requireTill` checks that the device is a paired till (`_lib.js:1267`, `:1291-1292`), not the person's role: the server answers 200 for any staff code of the store, a waiter's or the kitchen's included, and the role is checked in the browser (`acceptStaff`, `caisse-pairing.js:763-779`; revision 17, M1) | The returned name, when the role opens the till (cashier, manager or owner, `staff-roles.js:162-170`); otherwise the not-till row below |
| Team app sign-in | **Two steps** (§18.10). Step 1: `team.signin.title` and the Work e-mail field, with the primary `team.signin.next`, disabled until the field holds a valid address (`team.email.reason`). Step 2: the pad, with the e-mail as the identity line and Plain `team.edit_email`. The pad does not exist before step 2, so it can never send an empty e-mail (which `employee.js:336` would count as a failed try) | 4 | `POST /api/employee {action:'login', email, pin}` → `findEmployeeCredential` (`employee.js:316-352`) | The returned name and venue |
| Team clock-in and clock-out | `clock.code.title`, `clock.code.sub` | **6** | `POST /api/employee {action:'clock-in' or 'clock-out', attendanceCode}` (`employee.js:481-511`) | `clock.in_since` |
| KDS and till pairing | `pair.title`, `pin.sub.pairing` | 6 | `POST /api/pair/redeem {code}` | The venue name |
| **Store lock** (revision 21, F2: as shipped in `762bb255`, §10.26) | The lock's screen (§10.26) comes first; its primary, `lock.store.action`, opens this pad, with `lock.store.prompt` as its title step and `lock.store.foot` under the keys, and a Plain `action.back` below them that returns to the screen (revision 22, F2: §10.26 difference 6); its second action, `lock.store.open_without`, runs the reload: the paired store's till without the held service, or the pairing pad when unpaired | 6 | `POST /api/pair/redeem {code}`, as the pairing use | The held store's code: the lock leaves and the store's staff pad follows (the till lock above). Another store's code pairs the till with that store, and the page restarts as its till; the held service stays set aside (§10.26) |
| **Till approval** (revision 17, M1; inside the sheet of the act it approves) | `pin.till.title`, then `pin.till.sub` naming the act and the roles ("Closing the till needs the personal code of a cashier, a manager or the owner.", with `act.close_till`); for the shift change, `pin.till.handover_sub` naming the one person who may approve ("Sara confirms with their personal code.", revision 19, M2) | 4 | `POST /api/pin/verify {merchant, pin}` → `verifyStaffPin`; the role is then checked in the browser by `authorizeTill` (`caisse-pairing.js:941-948`, through `KiwiRoles.opensTill`) | Nothing of its own: the pad closes and the act continues |
| **Manager approval** (inside the sheet of the act it approves; revision 17, M1: the manager level only, never the till acts above) | `pin.manager.title`, then `pin.manager.sub` naming the act ("Cancelling sale #1208 needs a manager's personal code.", with `act.cancel_sale`; revision 18, M5) | 4 | Per act, below | Nothing of its own: the pad closes and the act continues, so the act is the feedback |

**Two approval levels, as shipped (revision 17, M1).** The till opens one authorization modal, `openAuthorization` (`kiwi-caisse.html@31c94529:17328-17345`), at two levels. `requireTillOperator` (`:17323`, also published as `window.KiwiAuthorizeTillAction`) opens it at the **till level**: its title is "Autorisation caisse", its hint "Code caissier, manager ou propriétaire requis", and `managerCodeValid` (`:17353`) routes the code to `authorizeTill`, which accepts any role that opens the till. `requireManager` (`:17319`) opens it at the **manager level**: "Autorisation manager", "Code manager ou propriétaire requis", routed to `authorizeManager`. The design keeps the two levels as two uses of the pad, with their own title, sub and refusal.

**Till approval, per act (revision 19, M1 and M2).** Any code whose role opens the till may approve (cashier, manager or owner, `staff-roles.js:162-170`), except the shift change. The server proves the code and issues the `actorProof` only for those roles (`pin/verify.js:63`); the role is checked in the browser (`authorizeTill`, `caisse-pairing.js:944-945`). **"Needs a connection" means one thing: the act's effect is a server write with no outbox.** Offline, such an act would be approved and then fail, so it opens in the needs-connection state instead (response states, below). Every other till path writes locally, or through an outbox, and completes offline.

| Act (its `act.*` key, §9.6) | Call site | Who may approve | Offline |
| --- | --- | --- | --- |
| Clear the current order, nothing sent yet (`act.clear_order`) | `kiwi-caisse.html:10907` | Cashier, manager or owner | Completes: the cart is cleared locally |
| Cancel a live order (`act.cancel_order`) | `:10907` (an order already sent), `:21160` | Same | **Needs a connection:** `cancelOrderProTakeaway` posts through `postCaisseCancellation`, a request with no outbox (`:12274-12290`); offline it fails and keeps the order (`:21157`) |
| Cancel a table through `cancelSentTable` (`act.cancel_table`; revision 20, M2: the path decides, not the act) | `:10924` (the Salle cancel-table button on a real store), `:10951` | Same | Completes only when the table has no session and no ticket, local, sent or on the server: it is then reset locally (`:12992`). **Otherwise needs a connection:** without a session it throws "visite en cours de synchronisation" (`:12987-12990`); with one, the cancellation is posted with no outbox (`:12995-12996`) |
| Cancel a table through `cancelOpenTable` or `cancelNewOrder` (`act.cancel_table`) | `:10943`, `:13026`, `:13071` | Same | Completes: the table is reset locally, and the closing of its guest session, if it has one, is queued in the `KiwiOffline` outbox (`releasePhoneTable`, `:13039` and `:13083`; `orderpro-inbox.js:353-371`). `cancelNewOrder` resets a table only when nothing on it is sent or committed (`:13055`) |
| Close the till (`act.close_till`) | `:16468` | Same | Completes: the close is written locally (`:16384-16446`) |
| Cash in or cash out (`act.cash_in`, `act.cash_out`) | `:16995` | Same | Completes: the movement is recorded locally (`:16998-17008`) |
| Shift change (`act.shift_change`) | `:19024` | **The incoming cashier only:** `confirmHandover` refuses any other identity (`:18904-18907`). **The picker offers only entries whose stored role `KiwiRoles.opensTill` accepts** (revision 21, P7; `assets/staff-roles.js@31c94529:162-171`): a role that resolves to `caisse`, `manager` or `proprietaire` by id, label or alias (`idOf`, `:114-121`), or one of the legacy tokens `staff`, `owner`, `admin`, `direction`, `gerant` and `patron`. A waiter is never offered. An entry with no stored role is left out too, although the shipped roster labels it "Caissier" (`kiwi-caisse.html@31c94529:15420`), because `opensTill` refuses an empty role. With no entry left, the picker shows its empty state, as shipped (`:18803-18812`). The shipped picker lists every entry of `KiwiConfig.pins` (`:15409`, `:15420`, `:18800`), which this rule changes | **Needs a connection** on a real store: `confirmHandover` refuses an approval without the server's `actorProof` (`:18900-18903`) |
| Remove an order from tracking (`act.untrack_order`) | `:21352` | Cashier, manager or owner | **Needs a connection:** the archive needs the `actorProof` (`functions/api/order/queue.js:2010`) and has no outbox |
| Reject an incoming online order (`act.reject_online`) | `assets/orderpro-inbox.js:247`, through `window.KiwiAuthorizeTillAction` | Same | **Needs a connection:** the rejection is posted with no outbox (`orderpro-inbox.js:279`) |

**Manager approval, per act** (the manager level of the same modal, `kiwi-caisse.html:17319-17396`, which the vertical pages reach through `window.requireManager`, `:17445`):

| Act (its `act.*` key) | Request | Who may approve, and where that is checked |
| --- | --- | --- |
| Cancel sale (`act.cancel_sale`) | The code travels **in** the cancel request: `POST /api/sale/cancel` | `verifyStaffPin(…, {requireTill:true})`, then 403 `manager-required` when the role is not a manager (`sale/cancel.js:276-282`). Server-side |
| Refund (`act.refund`; `kiwi-caisse.html:18382`, `:18543`, and the maison vertical's return, `assets/pos-maison.js:4466`, which passes no `action`, so no `approval` proof is minted and its refund request sends none, `:4474`) | `POST /api/pin/verify {merchant, pin, action:{kind:'refund', refundId, originalSaleId, amountCents, refundMethod}}`; the refund then carries the returned `approval` proof | The proof is issued only when the role opens the dashboard (`pin/verify.js:41-50`). Server-side |
| Stock adjustment (`act.stock_adjust`): a manual movement recorded through `requestManual` (`assets/maison-stock-movements.js:422-437`), on the types `needsApproval` marks manual (`:130-133`), which the maison vertical calls (`assets/pos-maison.js:3708`, `:3773`, `:7408`, `:8329`). **Revision 25 (P9): the restaurant till's Stock screen is not this path.** It opens from `#open-stock` (`kiwi-caisse.html:6113-6117`, `openStock` `:20533-20534`) and records waste, receptions and counts with no approval, as shipped, so every role may use it (§18.3) | Same route with `action:{kind:'inventory', movementIds, …}`; the push then carries the proof (`maison-stock-movements.js:436`) | Same rule (`pin/verify.js:52-58`). Server-side |
| Open the drawer without a sale (`act.open_drawer`; `kiwi-caisse.html:17026`) | `POST /api/pin/verify {merchant, pin}` | **In the browser:** `authorizeManager` checks the returned role against a manager pattern (`caisse-pairing.js:953`) |
| **Every discount** (`act.discount.pct` or `act.discount.amount`, by the remise's kind), as shipped: `applyRemise` always calls `requireManager` (`kiwi-caisse.html:18166`, `requireManager` at `:17319`, read at `31c94529`), as do the boutique and maison verticals (`assets/pos-boutique.js:2085`, `assets/pos-maison.js:2752`); there is no approval limit in the product and none is designed here | `POST /api/pin/verify {merchant, pin}`; the manager's id then travels as the sale's `actorId` (`sale.js:178-190`) | **In the browser today:** `caisse-pairing.js:950-953` checks the returned role against a manager pattern. Owner decision 11 proposes a server-side `discount` proof like the refund one. The pad's states below are the same either way |

**Every caller, at `31c94529`.** Till level: `kiwi-caisse.html:10907`, `:10924`, `:10943`, `:10951`, `:13026`, `:13071`, `:16468`, `:16995`, `:19024`, `:21160`, `:21352`, and `assets/orderpro-inbox.js:247`. Manager level: `kiwi-caisse.html:17026`, `:18166`, `:18382`, `:18543`; `assets/pos-boutique.js:2085`; `assets/pos-maison.js:2752`, `:4466`; `assets/maison-stock-movements.js:432`. **`till-approval-level-test` counts callers at run time, not by grep (revision 19, P9).** A grep misses the alias `var ask = window.requireManager` (`maison-stock-movements.js:427-432`) and counts the comment at `kiwi-caisse.html:17284`. And `requireTillOperator` and `requireManager` are local functions of the page script (`:17319-17325`), so wrapping their `window` names would see only the callers outside it. So the harness records where every caller ends up: each opening of the authorization modal, whose level `openAuthorization` writes into `#manager-modal-title` and whose act into `#manager-modal-sub` (`:17328-17337`). It drives every act and fails on an opening whose level and act are not in these two tables, and on a row that no act opened.

**Anatomy:**
1. Identity line (Body): the venue, the business, the e-mail (team step 2) or the act (manager).
2. Title (Heading): `pin.title`, or the use's title.
3. Subtitle (Footnote ink-2).
4. Dots: 12 px, 16 apart. Empty is a 1.5 px ink-2 ring; filled is solid ink-1.
5. Message row: min-height 20, always reserved. It is also the pad's message live region (revision 16, M3; Rules, below).
6. Keypad 3 × 4, `direction: ltr`. Bottom row: Face ID (dashboard lock only, else empty), 0, delete (`backspace` 24, mirrored in AR).
7. Optional Plain below the keypad (`team.edit_email`).

| | Phone | iPad | KDS |
| --- | --- | --- | --- |
| Key | 76 circle | 84 | 96 |
| Gaps | 24 horizontal, 16 vertical | same | same |
| Digits | Title, tabular, on a surface-2 cap | | |

The iPad centres the pad on the page, never inside a drawn phone. Inside a sheet, the pad's region is not a drag region (§10.3).

**Response states, one per answer the server can give:**

| Answer | Uses | Pad behaviour | Copy key (§9.6) |
| --- | --- | --- | --- |
| 200 `ok` | All (the till lock and the till approval only when the role opens the till: next row) | Dots fill accent; the returned name shows for `--k-dur-7`, then a `--k-dur-2` crossfade to the destination. Till approval and manager approval close at once and the act continues. Haptic per §15.3 | `pin.hello` (locks) |
| 200, but the role does not open the till (revision 17, M1: `verifyStaffPin` answers 200 for any staff code of the store, `_lib.js:1251-1350`; the role is checked in the browser, `caisse-pairing.js:772-774` and `:945`) | Till lock, till approval (not the shift change: the next row takes precedence there) | Dots danger for `--k-dur-7`, then clear; **keys stay enabled**, because the code is right and another person's will work. The till lock names the person, as shipped (`:774`), so nobody hunts for a typo that is not there | Till lock: `pin.not_till` (`pin.not_till.unnamed` when the answer carries no name); till approval: `pin.till.not_till` |
| 200, but the identity is not the incoming cashier (revision 19, M2: `confirmHandover` refuses it, `kiwi-caisse.html:18904-18907`) | Till approval, shift change | The pad checks the returned identity against the incoming cashier **before it closes**, so it never closes and then refuses, and **before the role** (revision 20, P5): any code the server proves (a 200) that is not the incoming cashier's gets this row, whatever its role, so `pin.till.not_till` never shows on the shift change. Dots danger for `--k-dur-7`, then clear; **keys stay enabled**, for the incoming cashier's own code; Failed (§15.3) | `pin.till.not_incoming` |
| 200, but the role is not a manager | Manager (refund and stock: no `approval` in the answer; a discount and the drawer: the browser's role check, `caisse-pairing.js:953`) | Dots danger for `--k-dur-7`, then clear; keys stay enabled | `pin.manager.not_manager` |
| 403 `manager-required` (`sale/cancel.js:282`) | Manager (cancel sale) | As the row above | `pin.manager.not_manager` |
| 401 `bad-pin` (`_lib.js:L1359`, `:L1436`) | Dashboard, till, till approval, manager | Shake (translateX 0, −10, 10, −8, 8, −4, 4, 0 over `--k-dur-6`) or, under reduced motion, no shake. Dots danger for `--k-dur-7`, then clear. On the dashboard lock, outside the demo surfaces, a refusal is final (`dashboard.html@a8158aad:6400`) and erases this browser's rows that match the code | `pin.wrong`; till approval and manager: `pin.manager.wrong`, which says that wrong codes count toward the store-wide pause and names no role, so it is true of both levels (revision 17, M1) |
| **No codes yet:** 401 `bad-pin` carrying `configured: false` (revision 20: the account has no code of any role, `_lib.js@a8158aad:1442-1454`, `pin/verify.js@a8158aad:39`) | Dashboard | Not a refusal: the lock opens, unmatched, as shipped (`dashboard.html@a8158aad:6414`, `:6401`). **It appears only after a first code is typed** (revision 21, P8): the server reports `configured: false` only on the `bad-pin` refusal (`_lib.js@a8158aad:L1454`, `pin/verify.js@a8158aad:39`), so the pad cannot know it before a code is sent. Nothing is written to or erased from the rows. A missing field counts as configured, so outside the demo surfaces the lock refuses (`:5939-5942`, `:6400`) | n/a |
| **No owner code** (revision 21, M3; a state of the lock, not a server answer): outside the demo surfaces, while nothing is typed, the roster the page holds (`KiwiConfig`'s `seenPins` and, once loaded, `pins`; `serverRosterSize`, `:5894-5900`) is not empty, this browser holds no proven row, and no entry of that roster is above the staff tier (`hasDashboardCode`, `maybeShowNoOwnerHelp`, `dashboard.html@a8158aad:6076-6098`). It is checked when `kiwi-account-pins-ready` fires and 1.5 s after load. A staff code typed here is refused as `bad-pin` (`:L5957`), so without this line the owner would read only "wrong code" | Dashboard lock | The setup line replaces the lock's help text, in the error style. Nothing shakes and **keys stay enabled**. The first digit typed brings back the usual help text (`:6354`, `:6020-6025`), and a refusal writes its own line; the setup line returns only when the check runs again. **While the setup line shows, a Plain `ob.forgot.support` sits under it** (revision 22, F6; the same words and the same page as onboarding's R3 row, §18): it opens `https://kiwi-os.com/support.html`, whose first section gives the e-mail address and the WhatsApp number. The link is absolute and opens in a new browsing context (`target="_blank"`, `rel="noopener"`), so the lock stays where it is: in the native app, a link to a kiwi-os.com page opens in the in-app Safari sheet (`app/src/native-runtime.js@ae45b301:2604-2623`); in a browser or the installed web app, it opens outside this page. Shipped, the line has no action (`dashboard.html@a8158aad:6089-6094`), so this is a change | `pin.dashboard.no_owner_code`, `ob.forgot.support` |
| 401 `bad-employee-code` (`employee.js:336`, `:344`) | Team sign-in | Same as `bad-pin`; step 2 keeps the e-mail | `team.bad` |
| 409 `employee-access-ambiguous` (`employee.js:340`) | Team sign-in | Dots clear; keys stay enabled | `team.ambiguous` |
| 403 `store-suspended` (`employee.js:295`, `:344`, `:369`) | Team sign-in, clock-in | Keys disabled | `access.suspended` |
| 401 `employee-session-required` (`employee.js:361`) | Clock-in | Keys disabled; secondary "Sign in" returns to the team sign-in | `team.session_ended`, `action.sign_in` |
| 403 `forbidden-till` (`_lib.js:1292`) | Till, till approval, manager | Keys disabled; secondary "Pair this till" opens the pairing pad | `pin.unpaired`, `pin.pair_till` |
| 401 `unauthorized` (`_lib.js:1392`) | Dashboard | Keys disabled; secondary "Sign in", which goes to `/auth/logout` as the shipped link does. No shake and no Failed haptic: the code was not judged. This browser's rows are kept, and none is read or erased (revision 20, P8). **Shipped differs** (`dashboard.html@319ac100:6047-6080`, `:6433`): the digits clear and the row shakes, as for a refusal; keys stay enabled; the line is inline copy with a link. The design keeps its row because a shake says "wrong code", which this answer is not | `pin.signed_out`, `pin.sign_in` |
| 401 `account-revoked` (`functions/_middleware.js@319ac100:623`: a signed session whose account was deleted or suspended; API callers get JSON, and the cookie is cleared) | Dashboard | As `unauthorized` | As `unauthorized` |
| 401 whose body is not JSON (the account gate's sign-in page, `functions/_middleware.js`, which answers before `pin/verify.js` runs) | Dashboard | As `unauthorized` | As `unauthorized` |
| 403 `attendance-code-invalid` (`employee.js:497`) | Clock-in | As `bad-pin` | `clock.invalid` |
| Network error on clock-in or clock-out, still unanswered **5 minutes after the code was typed** (revision 18, M7: an attendance code lives 5 minutes from its creation, `functions/api/team/live.js:169`, and is refused after that, `employee.js:495`, so by then it has certainly expired) | Clock-in | Automatic retry stops: this is a new cause, so the message row writes `clock.code_expired` once, politely. The digits clear and the keys are enabled for the next code. No time is kept: the server stamps a clock-in when it accepts it (`employee.js:509`), which is what the attendance code proves (Rebuttals, 3) | `clock.code_expired` |
| 503 `attendance-write-failed` (`employee.js:523`) | Clock-in | Keys enabled; the code stays for a retry | `clock.not_recorded` |
| 422 `invalid_or_expired` (`pair/redeem.js:106, 153, 158`) | Pairing, store lock | As `bad-pin` | `pair.invalid` |
| No answer to a redeem: a throw or the 8 s timeout (revision 19, M4) | Pairing, store lock | **The code is never sent again by itself:** `pair/redeem.js` spends it in one `UPDATE … WHERE used_ts IS NULL` (`:146-147`), and the first request may have committed after the till stopped waiting. No other request is sent to find out (revision 20, M1; revision 21: on every pairing pad, whatever the network net allows). Keys enabled, digits cleared | `pair.no_answer` |
| 404 or 405 from `POST /api/pair/redeem` (revision 22, F5). The route itself answers only 200, 422, 429 and 503 (`functions/api/pair/redeem.js@762bb255:46-190`; its header, `:15`, says it must never answer 404 or 405), so such an answer did not come from the route's code, which is the only place a code is spent | Pairing, store lock | As the 503 row below: keys enabled, the digits clear, and the same code may be entered again. A hosted till does not fall back to the same-browser map (§22) | `pin.unavailable` |
| 422 to a code typed again after a redeem that got no answer | Pairing, store lock | As `bad-pin`. The till cannot tell whether its first redeem spent the code, so the copy says "may". Engineering option, not a requirement: make a redeem by the same `terminalId` (`redeem.js:91`) idempotent for a short window | `pair.maybe_used` |
| 429 `too_many_attempts` with `retry_after` (`_lib.js:1193`) | Dashboard, team, clock-in | Team and clock-in: keys ink-3 and disabled. Minutes = `retry_after` / 60 rounded up, updated each minute; the pad re-enables itself at zero. **Dashboard lock (revision 21), as shipped:** keys stay enabled; outside the demo surfaces the code is refused (the dots shake and clear) and the line gives the minutes, rounded up (`dashboard.html@a8158aad:6410-6411`, `:6050-6061`); the next code is sent to the server again | `pin.paused.self` |
| 429, till lock and both approvals | Till, till approval, manager | As above, but the copy says the pause covers **every code on every till of the store**, because the bucket is keyed `till:<merchant>`, not per device, and a success does not clear it (`_lib.js:1272`, `:1294-1302`). A manager's wrong codes inside a cancel sheet count toward the same bucket. **Until owner decision 8 ships `POST /api/pin/unlock`, the pad says only how long to wait** (`pin.paused.store`); the second line `pin.paused.owner_hint` is rendered only when `/api/config` reports the route (`features.pinUnlock: true`) | `pin.paused.store` (+ `pin.paused.owner_hint` when the route exists) |
| 429, pairing | Pairing, store lock | As above; the counter is per network address (10 wrong codes in 10 min, then 15 min) | `pair.paused` |
| 503 (`rate-limit-unavailable` `:1235`, `auth-verification-unavailable` `:1268`, `staff-unavailable` `:1352`, `not-configured`) | All; the dashboard lock first reads its rows, as for no answer (below) | Keys enabled; the entered digits clear | `pin.unavailable` |
| 400 (`missing-fields`, `bad-json`) | None | Unreachable from the pad, which only sends full codes; logged and shown as 503 | `pin.unavailable` |
| Network error (revision 16, M1, one row per use; revision 17, P4: "network error" is a request that throws, which is no network, the timeout of the retry rule below, or a body that is not JSON) | Team sign-in, clock-in. Neither has an offline check | Keys disabled; the digits are kept; secondary "Try again"; automatic retry under the retry rule (below), which writes nothing while the cause stays the same | `pin.offline` |
| The server cannot answer the dashboard lock (offline, known at once from `navigator.onLine`; the 8 s timeout; a 5xx; a throw: `dashboard.html@a8158aad:5928-5964`), and the typed code matches a row this browser holds (an owner's, or a manager's while the account's list has not loaded, `:5968-5978`) | Dashboard lock | As 200 `ok`, with the row's name | `pin.hello` |
| The server cannot answer the dashboard lock and no row matches, outside the demo surfaces (`:6395`) | Dashboard lock | As `bad-pin`: shake, dots danger, then clear; **keys stay enabled**. No automatic retry: the next code is the retry | `pin.dashboard.offline_unknown` offline; `pin.unavailable` online |
| The server cannot answer, and this browser's rows are paused: five codes in a row matched no row (revision 20: the rows count their own misses, because the server sees none, `assets/dashboard-pin-vault.js@a8158aad:51-52`, `:85-97`) | Dashboard lock | **Keys stay enabled, and every code is sent to the server first** (revision 21, M4): the pause is read only after the server has not answered (`dashboard.html@a8158aad:6417-6421`), so a server that answers judges the code as usual. While paused, a code the server cannot judge is refused: the dots shake and clear, no row is read (`dashboard-pin-vault.js@a8158aad:170`), and the line gives the minutes left, rounded up (`dashboard.html@a8158aad:6050-6061`). The pause ends 5 minutes after the fifth miss (`dashboard-pin-vault.js@a8158aad:52`, `:95`) | `pin.paused.self` (shipped as inline text, `:6050-6061`, which this key replaces) |
| Network error, the typed code matches a verifier row of the paired store | Till lock | As 200 `ok`, with the row's name and role, when the role opens the till; a row whose role does not is refused by name, as online, because rows are written whatever the role (`caisse-pairing.js:921`). Owner decision 2 keeps this | `pin.hello`; `pin.not_till` |
| Network error, no row matches | Till lock | As `bad-pin`: shake, dots danger, then clear; **keys stay enabled**, because another person's code may match. No automatic retry: the next code is the retry | `pin.offline_unknown` |
| The store's staff list cannot be loaded, and the till holds no verifier row for the store | Till lock | Not a pad state. `askStaff` shows the pad only when rows exist (`caisse-pairing.js:653-657`); with none, its catch opens the till (`:658-659`) **whenever the staff list cannot be loaded** (revision 17, P6): no network, but also a status other than 2xx, a captive portal's HTML page answered with 200, or JSON without a `pins` array, each of which makes `pinsFor` throw (`:621-632`). This is part of owner decision 2 | n/a |
| Network error, till approval, an act that completes offline (the till-approval table's Offline column) | Till approval | A verifier row matches and its role opens the till: approved, as 200 `ok`, and the act records that the verdict was offline (the verifier's Staleness row). A row matches and its role does not: as the not-till row. No row matches: as `bad-pin`, keys enabled, no automatic retry | `pin.till.not_till`; `pin.offline_unknown` |
| The till is offline when the pad opens for an act that needs a connection (the till-approval table's Offline column; revision 18, M2 and M3; the set widened in revision 19, M1) | Till approval | The **needs-connection state**, before any code is typed: the title and the act as usual; the keys drawn but `aria-disabled` (Rules); the message row writes `pin.till.needs_connection` once, assertively; Plain Close. "Offline" is known when the pad opens: `navigator.onLine` is false, or the till's last request threw and none has succeeded since. **Exits:** an `online` event or any request that succeeds ends the state: the keys are enabled, the message row is cleared and writes `pin.connection_back` once, politely, and focus stays where it was. Close returns to the act's sheet, unchanged (the handover keeps both counts and the chosen cashier). No haptic, no dots, no `pin.hello` at any point | `pin.till.needs_connection`, `pin.connection_back` |
| Network error, till approval, an act that needs a connection (the till believed itself online when the pad opened) | Till approval | The verifier is **not** consulted, so a code is never approved without the server. Keys `aria-disabled`, the digits kept, secondary Try again, which sends them. **Nothing is sent by itself**, not on an `online` event either (revision 19, M3: an approval is never retried automatically, the retry rule) | `pin.till.needs_connection` |
| Network error, a manager act approved by role: a discount (`kiwi-caisse.html:18166`) and opening the drawer without a sale (`:17026`) | Manager | A verifier row matches and its role is a manager's (`caisse-pairing.js:953`): approved, as 200 `ok`. A row matches and its role is not: as the not-a-manager row. No row matches: as `bad-pin`, keys enabled, no automatic retry | `pin.manager.not_manager`; `pin.offline_unknown` |
| Network error, an act the server must approve: a refund (`approval` proof, `caisse-pairing.js:958`), a stock adjustment (its push carries the proof, `maison-stock-movements.js:436-437`) and a sale cancellation (the code travels in the request) | Manager | Keys disabled; secondary "Try again"; **no** automatic retry, because an approval is a one-off act and the sheet behind it is unchanged. As shipped, a stock adjustment offline is approved from a verifier row and the movement is then undone when its push fails (`maison-stock-movements.js:432-437`, `caisse-pairing.js:950-962`); this row replaces that (revision 20, P6) | `pin.manager.offline` |

**The till's offline verifier (shipped; stated in revision 16, M1; revision 18, M4: its verdict may be stale).** Revision 15 said a till cannot unlock offline because codes are compared on the server only. That is false at `31c94529`: the till keeps a verifier of each code proven online, and the file's own comments at `caisse-pairing.js:888-889` and `:939-940` describe the code wrongly, which is where the false premise came from. CLAUDE.md §6 states the same premise; whichever way owner decision 2 goes, that line and those comments are corrected to match it (a documentation task outside this spec). The verifier, as shipped:

| | What the till does (`assets/caisse-pairing.js@31c94529`) |
| --- | --- |
| What a row holds | A salted SHA-256 digest of `store:salt:code` and the proven identity (id, name, role), never the code (`:70-91`) |
| Written | When the server proves a code on this till (`verifyCode`, `:921`), for the store the check named: one row per person, the newest replacing that person's older row. **Whatever the role** (revision 17, M1): the row is written before `acceptStaff` or `authorizeTill` looks at the role, so a waiter's code proven online has a row, and offline it matches and is then refused by role |
| Limits | 7 days from the last online proof (`OFFLINE_PIN_TTL`, `:33`); at most 12 rows per store, the newest kept (`:88`). So a code used on this till in the last 7 days can still have no row, evicted by 12 newer ones, which is why the offline refusal says only that the code can't be checked offline here (`pin.offline_unknown`, revision 17, P1) |
| Read | Only when the online check throws (`:923`): the typed code is hashed with each row's salt and compared (`:92-99`). A 401 or any other answer from the server is final: an online refusal never falls back to a row |
| Uses | Every code door of the till goes through `verifyCode`: the till lock, the till approval (`authorizeTill`, `:941-948`) and the manager approval (`authorizeManager`, `:950-962`). So, offline, a till unlocks and an act approved by role is approved, for any code proven on this till in the last 7 days and still among its 12 rows, whose role fits the level. A refund cannot be, because its `approval` proof comes only from the server (`:958`). The native app's idle relock skips all three, as shipped (revision 22, F1: below the dashboard's table) |
| Shows the pad offline | `askStaff` shows the till lock, when the staff list cannot be loaded, only when rows exist (`:653-657`); with none, it opens the till (`:658-659`), whatever made the list fail to load (revision 17, P6) |
| Deleted | The previous store's rows at a re-pair to another store (`:221`) and the store's rows at unpair (`:376`); expired rows are ignored when read (`:63`) |
| Scope | Per store: the storage key names the store (`:57`) and the digest includes it (`:72`), so one store's rows can never match a code typed for another |
| Revocation | A code removed or changed in the dashboard is refused at once online, and still matches offline on a till that proved it, until its row expires (at most 7 days). A role changed in the dashboard is read offline as the role at the last proof, because the role check runs in the browser on the row's copy (`staff-roles.js:156-170`) |
| Staleness (revision 18, M4; revision 19, P8) | An offline verdict was proven online within the last 7 days and **may be stale**: it is the server's answer at the row's last proof. **Requirement:** the identity a row hands the act carries `verdict: 'offline'` and `provenAt` (the row's `expiresAt` minus 7 days), and the till's authorization log gains an entry for **every** approval and unlock, till level included, with the identity, `verdict` and `provenAt`. Today that log (`kiwi-caisse.html:17406`) records only manager-level approvals, as `{id, time, action}`. `offline-verifier-test` asserts the entries. Owner decision 2 states the lag as the owner's risk |

**The dashboard lock's offline rows (shipped in `4dcd0685`, `0268c92f` and `a8158aad`; revision 20).** The lock asks the server first for every code typed (Face ID: the row below; the idle relock: after the table). The browser keeps no code: `KiwiDashPinVault` (`assets/dashboard-pin-vault.js@a8158aad`) holds salted rows of the codes the server has proven here, read only when the server cannot answer. This direction adopts it as shipped, except where a row below says **Designed** (the Deleted and Face ID rows); decision 14 records the owner's two calls on it.

| | As shipped, and as designed |
| --- | --- |
| What a row holds | A salted SHA-256 digest of `dashboard:account:salt:code` and the proven identity (id, name, role), never the code (`:109-113`, `:150-156`) |
| Written | When the server proves a code of the owner or manager tier on this browser (`vaultNote`, `dashboard.html@a8158aad:5984-5990`). One row per code and per person, the newest replacing the older. Never on a scoped (operator) view (`:5881`) |
| Limits | 7 days from the last proof, at most 12 rows per account, the newest kept (`:42-43`, `:100`); scoped by `kiwiAccountKey` (`:60-61`). Five misses in a row stop reading them for 5 minutes (`:51-52`, `:170`) |
| Read | Only when the server cannot answer (the response rows above): offline, known at once; the 8 s timeout (`ASK_TIMEOUT_MS`, `dashboard.html@319ac100:5930`); a 5xx; a throw. An owner's row unlocks; a manager's only while the account's list has not loaded (`:5995`); a staff-tier row never, although none is written (`:5994`; revision 22, F3, so this row and the Face ID row state the same bounds). Outside the demo surfaces, when the server answers with a 200 or a 429, or with a 401 or 403 whose body is `bad-pin`, `unauthorized` or `account-revoked`, or a 401 whose body is not JSON, that answer decides and no row is read. A 401 or 403 with any other body, and a 403 that is not JSON, is `null`: the device could not tell, so the rows are read, as after a 5xx. This is `main`'s `askServer` since `d004116f` (`dashboard.html@319ac100:5942-5962`), and the design adopts it |
| Face ID (the native app; revision 21, M5; the shipped half refreshed in revision 25 for `73870f82`) | **Shipped, since `73870f82` on `main`** (revision 21 described `ae45b301`, where the record opened the lock with no server call and no expiry). **Enrolment** follows only a code the server has just proven online at the owner or manager tier: only then does `POST /api/pin/verify` return a Face ID mark, a keyed digest over the tier and the account's owner and manager codes, never a code (`functions/api/pin/verify.js@73870f82:67-78`; `faceMarkState`, `functions/auth/_lib.js@73870f82:1238`; `native-runtime.js@73870f82:1732`, `:1761-1765`). The record keeps `{account, access, name, at, mark}` in the device's secure storage; a record with no mark, or of the staff tier, is never honoured (`readFaceUnlock`, `:1519-1528`). **Unlock:** a Face ID success sends the mark to `POST /api/pin/face`, session-bound and with no code (`functions/api/pin/face.js@73870f82`; `askFace`, `native-runtime.js@73870f82:1536-1558`). The lock opens on its yes, with the tier it returns, and the record's clock restarts (`confirmFace`, `renewFace`, `:1560-1578`; `tryFace`, `:1654`). A 401 or 403, which a changed owner or manager code produces, deletes the record and the Face ID key (`dropFace`, `:1679`). When the server cannot be reached (offline, the 8 s timeout, a 5xx, or a 429, which the app reads as unreachable), the record opens the lock within 7 days of its last yes and is deleted after them. Typing the changed code once renews the mark (`:1738-1745`). A cashier's code is not in the mark, so changing it touches no record. `face-unlock-test` and `native-face-entry-test` hold this, wired into `check.js`. **Two differences from the design below remain:** offline, a manager's record opens within the 7 days whatever the account's list holds, where the design opens it only while the list has not loaded (decision 14 (b)); and a 429 opens it offline, where the design opens nothing on a 429. Both are engineering's, and the design stands. **Designed:** the record holds no code. It holds what the server needs to judge it again: the account, the person's id and a proof the server issued when the code was proven. The server stops accepting that proof once the code is changed or removed, or the person's role no longer opens the dashboard (the proof's form is engineering's). Online, a Face ID success sends that proof first, and the lock opens only on the server's yes, with the identity the server returns then. A server "no" deletes the record, and the pad stays as after a cancelled Face ID. A 429 opens nothing and keeps the record, as the 429 row says for a typed code. When the server cannot answer (the Read row's cases), the record opens the lock only within 7 days of the server's last yes for it, the rows' limit (`assets/dashboard-pin-vault.js@a8158aad:42`), and only within the tier bounds of a typed code read offline (revision 22, F3; `localVerify`, `dashboard.html@a8158aad:5974-5975`, and the Read row above): an owner's record opens it, a manager's only while the account's list has not loaded (decision 14 (b)), and a record of the staff tier never does. A record from before this change holds no proof, and is deleted when read. Sign-out still forgets it |
| Deleted | **Designed:** a 401 `bad-pin` (not No codes yet), and a 200 whose role is of the staff tier, erase every row that matches the code (`forget`, `assets/dashboard-pin-vault.js@a8158aad:179-191`); a 401 or 403 whose body is `unauthorized` or `account-revoked`, a 401 whose body is not JSON (an expired session), and any other 401 or 403 body erase nothing: the signed-out answers settle before `vaultNote` runs, and `vaultNote` erases only on `'no'` (`dashboard.html@319ac100:6004-6011`, `:6448`). Expired rows are ignored when read; the tenant purge removes rows with every `kiwi:` key (`tenant-purge.js@a8158aad:44`), which runs when another account signs in on this browser (`identity.js:97-100`) |
| Migration | `kiwiPins` is deleted at load, without conversion (`dropLegacy`, `:197-204`), and the onboarding no longer writes it. An owner offline on the day of the update cannot unlock until the server has proven a code once |
| "No codes yet" | Only the server says it, with `configured: false` on a refusal (the response rows above); no browser state decides it any more (`a8158aad` removed `onboardedHere()`) |

`dashboard-pin-migration-test` (§21.1) holds the shipped behaviour (below).

**The idle relock and device biometrics (revision 22, F1): a known shipped deviation, on both locks.**
- **Shipped, the dashboard half fixed by `73870f82` (revision 25).** After the relock's reload, a biometric success on the dashboard now opens the lock only when the stored Face ID record stands: the server's yes online, or the 7 days offline (`confirmStoredFace`, `app/src/native-runtime.js@73870f82:1580-1594`, `:2027-2034`); a refusal or an expired record deletes it. Two details still differ from the design: biometrics are asked even with no record (nothing then opens), and the lock opens through `reveal()`, not with the record's tier. **The till half is unchanged, by the owner's decision, pending (§23 decision 16):** the till still opens through `window.__kiwiUnlockApp` with no code (`:2035-2036`). What follows describes `ae45b301` and the till as it still is.
- **Shipped at `ae45b301`.** Two things reload a page and mark it for a biometric unlock. The native app does, when it comes back after 20 minutes or more in the background (`handleNativeAppState`, `app/src/native-runtime.js@ae45b301:1864-1879`, sets `kiwi:native:biometric-pending`); so does the dashboard's idle lock, in any host, after 10 minutes visible without a gesture or 3 minutes hidden (`lockNow`, `assets/idle-lock.js@319ac100:178-187`, sets `kiwiIdleLockReason`). After the reload, in the native app only, `maybePromptBiometricUnlock` (`native-runtime.js@ae45b301:1882-1910`) asks the device's own biometrics, and on success opens the page **with no code, no Face ID record and no server call**: the dashboard through `__kiwiLock.reveal()`, which is `skipToApp()` (`dashboard.html@a8158aad:6302`, `:6637-6656`), and the till through `window.__kiwiUnlockApp` (`kiwi-caisse.html@319ac100:13997`), which runs `unlockApp()` (`:14015`) past the staff pad. A third branch hides `#pin-screen` when neither hook exists; only the till has that element. A failed or cancelled prompt, or no biometric hardware, leaves the pad. `tools/biometric-unlock-test.mjs`, run by `check.js` (`tools/check.js@319ac100:1415`), asserts all of this.
- **What that does.** The dashboard opens with no server judgement, so a code changed or removed in the dashboard does not stop it. The till opens with no staff identity, so the acts that follow carry no cashier, and none of the till's code doors (the verifier's Uses row) is passed. This deviates from both locks' rows above, as the Face ID row's shipped path does. The engineering task offered for the Face ID row is to cover the dashboard side as well.
- **Designed, dashboard.** The idle relock is not a second way in. Biometrics are asked only when this device holds a Face ID record for the account, and a success is the Face ID row's: the record's proof goes to the server first, and the lock opens only on its yes or, when the server cannot answer, within that row's 7 days and tier bounds. With no record, nothing is asked and the pad shows. `reveal()` stays for the operator flow its comment names (`dashboard.html@a8158aad:6657-6661`); the relock never calls it.
- **Designed, till (owner decision 16, §23).** An idle relock returns the till to the staff pad, and device biometrics never stand in for a staff code. They prove that a face or finger enrolled on the iPad is present (`.deviceOwnerAuthenticationWithBiometrics`, `app/plugins/kiwi-printer-socket/ios/Sources/KiwiPrinterSocket/KiwiPrinterSocketPlugin.swift@319ac100:366-385`), which says whose iPad it is, not which person is at the counter, and every act the till records needs that person. So the native app asks no biometrics on the till. The relock's reload stays as shipped; only what follows it changes.
- **The test changes at stage 3a, with the pad (§21.1).** Two checks of `biometric-unlock-test` assert the shipped deviation and change: "kiwiIdleLockReason alone is pending and successful biometrics reveals the lock" becomes "with no Face ID record, nothing is asked and nothing opens; with one, a success sends the record's proof first"; "successful biometrics uses the caisse unlock hook when no dashboard lock exists" becomes "on the till, a pending relock asks no biometrics and shows the staff pad". Its other checks stay. `dashboard-pin-migration-test` asserts the dashboard half with the Face ID row's cases.

**The retry rule (one rule, for every pad; revision 17, M3 and P4; revision 21: the store lock's roster step, which also used it, is removed, §10.26).**
- **Timeout.** Every request a pad sends is aborted after **8 s**, one constant, `KIWI_REQUEST_TIMEOUT_MS`. It replaces the roster's `ROSTER_TIMEOUT_MS` and the 12 s of the shipped `verifyCode` (`caisse-pairing.js:894-924`); the dashboard lock already uses 8 s (`dashboard.html@a8158aad:5927`), and the team and pairing requests have none. A timeout reads as no connection.
- **Who caused a request.** The final digit and a Try again are the person's. So is an automatic request that a Try again joins: the button turns busy and the answer counts as the person's. Every other request is automatic.
- **What retries by itself (revision 19, M3 and M4).** Only no connection, and only for the team sign-in and clock-in. **Never** an approval of either level (Try again only, the digits kept), never a redeem (pairing and the store lock: a code is spent once), never a server error (503: the retry is the code typed again, so a failing server is not polled; revision 20, P7), never the dashboard lock, and never an offline verdict from a row, after which the keys are enabled and the next code is the retry.
- **When.** One request at a time. The next automatic request is sent 10 s after the last request ends, whoever started it. An `online` event while a request is in flight is ignored; one between requests sends a request at once, and the 10 s count starts again from its end. So no tick lands on a request in flight.
- **What is written.** The answer to a request the person caused is written into its region, cleared and written again in the next frame even when it is unchanged, so the person who pressed hears it. **An automatic retry writes nothing** while it runs, and nothing when its answer has the same cause as the message already shown. When the cause changes (the connection is back and the code is refused, the server answers 503, a pause begins), the new message is written once into its own region, polite or assertive by the message-row rule below, without moving focus. A success after an automatic retry proceeds as any success. An automatic answer fires no haptic (§15.3).
- **Try again.** It appears with the first failure, never before, in a slot reserved from the first frame (the pad's slot below the keypad, anatomy 7). It stays enabled and focusable, carries `aria-busy="true"` while its request runs, and is never `disabled`, because disabling the focused button drops keyboard and VoiceOver focus.

**Other states:**

| State | Behaviour |
| --- | --- |
| Empty | No dots filled; delete disabled |
| No staff codes (till lock; revision 14, P6) | The store's configuration can answer with no codes and say that none is required: `pinsFor` returns empty `pins` with `pinGateConfigured` false (`caisse-pairing.js:621-632`). Then the till lock is not shown and the till opens, as shipped (`askStaff`, `:643-649`). This is the owner's choice for the store, not a failure, so nothing says a code is missing. The store lock's exit takes the same path for such a store (§10.26) |
| Pressed | Cap to surface-3 on pointerdown; Choose haptic on pointerdown, except on the final digit (§15) |
| Focus | Inset ring on the key; hardware digits, Backspace and Enter work |
| Loading | After the final digit, the keys are `aria-disabled` (Rules) and the dots pulse together (opacity 1 to 0.5, `--k-dur-9` loop, `data-k-loop`); the progress region writes `pin.checking` once, in place of "4 of 4 entered". Reduced motion: static text `state.checking` |

**Rules:**
- **Two kinds of live region, both present and empty when the pad is inserted** (VoiceOver does not announce a region inserted with its text):
  - the **progress region**, `aria-live="polite"`, announces `pin.progress` ("2 of 4 entered") and never a digit;
  - the **message row** (anatomy 5; revision 16, M3) holds two regions, one polite (`role="status"`) and one assertive (`role="alert"`), and at most one of them holds text. **It is written once per answer to a request the person caused, never per digit:** cleared, then written in the next frame, so a second identical refusal after a second try is announced again. **An automatic retry writes nothing unless its cause changes** (the retry rule, above; revision 17, M3), so an offline pad does not interrupt VoiceOver every 10 s. **The rule:** an answer after which the keys stay enabled is written to the polite region (`pin.wrong`, `pin.manager.wrong`, `pin.manager.not_manager`, `pin.not_till`, `pin.not_till.unnamed`, `pin.till.not_till`, `pin.till.not_incoming`, `team.bad`, `team.ambiguous`, `clock.invalid`, `pair.invalid`, `pair.no_answer`, `pair.maybe_used`, `pin.offline_unknown`, `pin.dashboard.offline_unknown`, `pin.unavailable`, `clock.not_recorded`), because the cashier simply types again. An answer that disables the keys is written to the assertive region (`pin.paused.*`, `pair.paused`, `pin.offline`, `pin.manager.offline`, `pin.till.needs_connection`, `pin.unpaired`, `pin.signed_out`, `access.suspended`, `team.session_ended`), because nothing typed will work until something changes. A success writes nothing: focus moves to the destination, whose heading carries it.
  - **Why it matters here:** an iPad has no haptic engine (§15.0), so for a VoiceOver cashier on the till the message row is the only sign that a code was refused. `pin-announce-test` (§21.1, stage 3a) asserts, for every row of the response table in every use, that the row's copy is written once into the stated region after the answer, that a repeat of the same refusal after a second try or a Try again is written again, that a digit writes only the progress region, and (revision 17, M3) that, with the network cut, three automatic retries with the same answer write nothing to either region, while an automatic answer whose cause changed is written once.
- Nothing is prefilled.
- **A key that cannot be used is `aria-disabled`, never `disabled` (revision 18, M6).** Everywhere this section says the keys are disabled (loading, a 429 pause outside the dashboard lock, a needs-connection or offline state, an unpaired till), each key keeps its place in the tab order and its focus, carries `aria-disabled="true"`, is drawn in ink-3, and ignores activation: a click, Enter, Space or a hardware digit does nothing, fires no haptic and writes nothing. So focus never falls to `body` (WCAG 2.4.3) and VoiceOver keeps its place. The state is announced once, through the regions the pad already has: `pin.checking` in the progress region, or the state's message in the message row, under the rule above (one write per request the person caused; an automatic retry writes nothing unless its cause changes). Pressing an `aria-disabled` key repeats nothing. `pin-focus-test` (§21.1, stage 3a) tabs to a key, enters the final digit, and asserts focus stays on that key through the loading state, a pause and the needs-connection state, that each is announced once, and that a key press in them changes nothing.
- **Where a code is compared (revision 16, M1; revision 19: the dashboard as shipped).** Online, on the server, always first: `POST /api/pin/verify` (the dashboard lock, the till lock and both approvals), `POST /api/sale/cancel`, and `POST /api/employee` (the team sign-in through `findEmployeeCredential`, and the attendance code at clock-in). Offline, the till and the dashboard compare a typed code against salted rows of codes the server proved on that device (the two blocks above), and only when the server cannot answer. No browser holds a code, and no code is sent to a till. The till reads only the **role** of a verified answer, online or from a row: for the till lock and the till approval, whether it opens the till; for the manager acts approved by role, whether it is a manager's (owner decision 11).
- "N tries left" appears only if the server adds a `remaining` field (§23.3).

### 10.3 Sheet, dialog and confirm

**Phone sheet:**
- Top radius 28; grabber 36 × 5 in ink-3 at 40 %, 8 from the top.
- Header min-height 56: title (Heading) on the leading edge; close icon button on the trailing edge.
- Body scrolls; a sticky footer respects the safe area.
- Detents: medium (50 %) and large (top safe area + 12, using `dvh`).
- **Drag region:** a drag that starts on the grabber or the header moves the sheet. A drag that starts in the body scrolls the body; only when the body is already at its top does a downward drag move the sheet, as in UIKit. A drag that starts on a **pad** (PIN pad, cash keypad, the docked keypad of the cash count) never moves the sheet: pads set `touch-action: none` and the sheet ignores pointers that start inside them. So a key's pointerdown haptic (§15.2) can never be followed by a sheet drag.
- Dismiss by dragging past 35 % or flinging faster than 800 pt/s, by the scrim, or by close. With dirty input, dismiss asks first.

**Semantics and containment:**
- The sheet's panel is `role="dialog"` with `aria-modal="true"` and `aria-labelledby` pointing at its title, both in the sheet's own shadow root.
- While open, every sibling of the sheet's host under `<body>` gets `inert` (iOS 15.5, §4), so VoiceOver, taps and Tab cannot reach the page behind. On guest browsers without `inert`, those siblings get `aria-hidden="true"` and the sheet traps focus itself.
- Escape closes; focus returns to the opener.
- Scroll containment: below iOS 16 the page is locked while the sheet is open (§4.1); on 16+ the sheet body also sets `overscroll-behavior: contain`.

**iPad and desktop:** a form sheet 540 wide (**720** for the cash count, §18.9, the widest that fits an iPad mini in portrait, 744, with 12 to spare on each side), centred, radius 28, same semantics.

| State | Behaviour |
| --- | --- |
| Rest, focus | As above |
| Pressed | n/a (its controls handle it) |
| Disabled | The footer primary is disabled until valid |
| Loading | A skeleton of the body |
| Error | A banner (§10.12) at the top of the body |
| Empty | Empty state (§10.16) inside |

**Confirm sheet (Tiers B and C, §11):**
- Title states the act and the object.
- Body states the consequence in true terms.
- Optional reason chips (radio semantics, §10.7).
- A code through the PIN pad when the act needs one, at the act's level (§10.2; revision 17, M1): the till approval for a till act such as Cancel table, the manager approval for a manager act. The pad replaces the sheet's body in place; Back returns to the reasons.
- Buttons: danger solid "Cancel sale · 230.00 MAD" and secondary "Keep sale".
- Caution haptic on the first frame (§15).

### 10.4 Popover
- Anchored to its control; width 360; radius 20; elevation 2.
- An arrow 12 wide points at the anchor; the popover flips side when there is no room.
- `role="dialog"` with `aria-labelledby`, not modal; focus moves in and returns to the anchor.
- Used for: options on iPad and desktop, the guest-count chooser, the date range and compare choice on iPad and desktop. **A popover never holds a keypad**: anything that needs one (discount, split, payment) happens in the bill pane (§10.25).
- On compact widths a popover becomes a medium sheet.

| State | Behaviour |
| --- | --- |
| Open | `--k-dur-3` glide: scale 0.96 to 1 with opacity, from the anchor |
| Dismiss | Outside tap or Escape; `--k-dur-2` exit |
| Focus | Trapped; returns to the anchor |
| Loading, error, empty | As for sheets |

### 10.5 Tooltip
- Inverse fill, radius 8, padding 8 × 12, Footnote, on-inverse text.
- Shows after a 500 ms hover or focus on desktop, and on long press for touch (rail icons only).
- Never carries the only copy of information.
- States: shown, hidden; no others.
- Hidden after `--k-dur-toast` or on pointerleave.

### 10.6 Segmented control and the lens

**Anatomy:**
- Track: surface-2 capsule, padding `--k-space-1` (4).
- **Lens:** `--k-select` fill, 1 px `--k-line-strong` edge (3.03 light, 3.35 dark against the track), elevation 1 in light.
- Labels: Footnote strong on compact (13 px, as UIKit's segmented control), Callout strong on default, and **Callout strong at the kitchen root** on the kitchen variant (18.75, 22.5 or 26.25 px at the S, M and L roots of §13.6; the station track in §6.6 is measured at the S root); unselected ink-2, selected ink-1.
- **Segment widths follow their labels:** each segment is `flex: 1 1 auto` with a minimum of the larger of 44 and its label width plus 24, so spare width is shared but a long label gets the room it needs. Measured in §6.6, the FR Orders filter "Tout · Carte · Espèces · Remboursements" needs 314.9 of the SE's 335 track and the FR range presets 281.7. When the labels plus padding are measured not to fit, the control becomes the scrolling track below.
- **Hit area ≥ 44 × 44 for every segment, carried by the segment's own box, never by an overflowing pseudo-element.** Revision 5 grew each segment with a `::before` that reached outside the track; the round 6 critic measured it at 36 in Chromium, because the track's `contain: layout paint` clips everything outside its box, hit testing included (and the scrolling track's `overflow-x: auto` would clip it the same way). Revision 6 moves the hit area onto the track instead:
  - the host `k-segmented` is the full target height (44 compact and default, 56 kitchen) and is the track's layout box;
  - each segment button is `height: 100%` of that box, so its hit rectangle is 44 (or 56) tall by construction, and its width is at least 44 by the minimum above;
  - the **visible** track is painted by the host's own `::before`, inset by the track inset (compact: `inset-block: 4px`, so it paints 36; default and kitchen: 0), and the lens and the labels are inset by the same amount plus the 4 px track padding, so the paint is exactly as before: compact paints a 36 track with 28 segments, default a 44 track with 36 segments;
  - the host uses `contain: layout style`, **never `paint`**, and nothing in the control relies on painting or hit testing outside its own box. The scrolling variant scrolls the host itself (`overflow-x: auto`), which clips nothing because every segment's box is inside the host's.
- **Recorded hit test:** the preview page builds a compact and a default segmented control from this CSS and samples `document.elementsFromPoint` on a 44 × 44 grid centred on each segment; every point must resolve to that segment's button. The page prints the measured hit height (44 for both) beside its fixture checks, and the same assertion is `target-audit` in §21.1.
- Optional count in tabular figures: "New 3".

| Context | min-height |
| --- | --- |
| Compact | Host 44; track painted 36 (inset 4); each segment painted 28, its button box 44 tall, so hit 44 |
| Default | Host 44; track painted 44; each segment painted 36, its button box 44 tall, so hit 44 |
| Kitchen | Host 56; track painted 56; each segment painted 48, its button box 56 tall, so hit 56 |

The target audit (Principle 4) measures **hit areas, not paint**: for every control it samples a 44 × 44 grid of points centred on the control with `document.elementsFromPoint` (through open roots, §20.4) and requires each point to resolve to that control. A segment that paints 28 and hits 44 passes; one that paints 44 and hits 28 fails, and so does any hit area that an ancestor's paint containment or overflow clips.

- 2 to 5 segments. More becomes a scrolling track (categories, stations) with the same lens, a 32 px edge fade and snap. **No "More" segment** exists anywhere.
- **The same lens paints the selected tab (§10.20), rail item and sidebar item.** One selection style, one module (§20.5).

**Semantics, by job:**
- A **filter or mode** (date presets, Orders filters, KDS stations, Customers statuses) changes the content in place and has no tab panels. It is `role="radiogroup"` with `role="radio"` and `aria-checked` on each segment.
- A **tab set** with panels is `role="tablist"` only when its panels render inside the same shadow root (`<k-tabs>`), so `aria-controls` resolves. No adopted surface uses one today.
- Arrow keys move the selection, mirrored in RTL.

| State | Behaviour |
| --- | --- |
| Rest | As above |
| Pressed | Label to ink-1 for `--k-dur-1` |
| Selected | The lens moves (§14.4); Choose haptic (§15) |
| Focus | Inset ring inside the focused segment |
| Disabled segment | ink-3, `aria-disabled="true"`, not focusable; the reason is visually hidden text inside the segment's own label |
| Loading | The lens moves at once; content shows a skeleton after 150 ms |
| Error, empty | n/a (they belong to the content) |

### 10.7 Chip (filters, quick values, sources)
- min-height 44, min-width 44; capsule; Callout; optional leading icon 20.
- **Inline padding 16**; with a leading icon, 12 before the icon, an 8 gap, 16 after the label. Width is its content (never fixed); a row of chips wraps to a second row before any chip truncates, and a single chip's label wraps to 2 lines only above factor 1, as buttons do (§10.1). Every chip label is in §6.6.
- **Fill is one step away from its ground:** surface-2 on bg or surface-1, surface-1 on a surface-2 card. So a chip never sits on its own colour (the Kiwi AI source chip on the s2 Today card is s1: 1.16:1 against s2 in light and 1.10:1 in dark, a decorative difference, while its accent-ink label carries it at 6.16 and 10.11 against the s1 fill).
- Selected state uses the lens paint (`--k-select` plus edge, ink-1 strong label).
- Used for: quick cash amounts, reason choices, discount presets.
- Mutually exclusive choices of ≤ 5 options with short labels use the segmented control instead.
- **Semantics:** a group where exactly one may be chosen (reasons, cash quick amounts, discount presets) is `role="radiogroup"` with `role="radio"` and `aria-checked`. Only a set where several may be on at once uses `aria-pressed`.
- **Source chip** (Kiwi AI): the same chip, Callout strong, accent-ink label, trailing `chevron_right` 20 (mirrored in AR), no selected state. It is a link to the figure's source; tapping opens that screen.

| State | Behaviour |
| --- | --- |
| Rest, pressed (surface-3), focus (ring per §10.0) | |
| Selected | Lens paint; `aria-checked="true"` (or `aria-pressed` for multi-select) |
| Disabled | ink-3 |
| Loading, error, empty | n/a |

### 10.8 List row
- **Anatomy:** a leading slot (icon 24 in a 36 surface-2 square with radius 8, or avatar 40); title (Body); subtitle (Footnote ink-2); trailing value (Body, tabular), chevron (`chevron_right` 20, ink-3, mirrored in AR), switch, or plain button.
- **Text never truncates silently:** the title and the subtitle each wrap to at most 2 lines and the row grows (its height is a min-height). Only a third line is cut with an ellipsis, and the full text is in the row's accessible name. The trailing slot keeps its intrinsic width; the text column takes the rest.
- **min-height:** 52 for one line, 64 for two, 72 with an avatar; 44 on a fine pointer.
- Insets 16; a hairline separator inset to the title start; groups are cards, radius 20, **one step from their ground** (the chip rule of §10.7): surface-1 on bg, **surface-2 on a surface-1 sheet or pane** (Kiwi AI's suggestions, the receipt choice, the options sheet's groups), so a group never disappears into the sheet it sits on.

| State | Behaviour |
| --- | --- |
| Rest | As above |
| Pressed | Fill surface-3 at once, fading over `--k-dur-2` |
| Focus | Ring inset 2 |
| Selected (split view) | Lens paint: `--k-select` fill, 1 px edge (3.52 light, 3.69 dark against s1), **plus** a leading 3 pt accent bar (6.16 light, 8.58 dark against s1) and `aria-selected` |
| Disabled | Title and value in ink-3; no chevron |
| Loading | A skeleton row of the same min-height |
| Error | The trailing slot becomes a plain "Try again" |
| Swipe (phone) | Trailing actions 72 pt each, in tonal fills (tonal danger for destructive). Crossing the full-swipe threshold (60 % of the row) fires Grab for a Tier A action and Caution for a Tier B one; releasing past it performs the action's tier (§11, §15) |

**Every swipe action also exists as a visible control:** an overflow button (`more_horiz`, 44) appears on rows with actions on iPad and desktop. On phone the same actions are in the item's detail screen. VoiceOver reaches them through that detail screen.

### 10.9 Text field and search field
- min-height 44; radius 12; fill surface-1; 1 px `--k-line-strong` outline (3.28 against bg).
- Label above in Footnote strong, ink-2, as a native `<label for>` in the same root. The **value** is Body ink-1 and the **placeholder** Body ink-3 (so a field never changes size when typing starts); the placeholder is an example only, never the label, and never `••••`.
- Helper or error text below, in Footnote, linked by `aria-describedby` in the same root.
- Search variant: leading `search` 20; clear button 44 when filled; capsule radius.
- Numeric amounts use `inputmode="decimal"`, or the cash keypad on the till. No `type="number"` spinners.
- The kit field is not form-associated (no `ElementInternals`, §4.1). It exposes `name` and `value`, and fires composed `input` and `change` events; the sheet or page that owns it reads `value`.

| State | Behaviour |
| --- | --- |
| Rest | As above |
| Focus | Outline becomes 2 px accent (replaces the ring) |
| Filled | Value in ink-1 |
| Disabled | Fill surface-2, text ink-3 |
| Loading | (search) a spinner replaces the clear button |
| Error | 2 px danger outline; danger Footnote message with an `error` icon 16; `aria-invalid="true"` |
| Empty | Placeholder |

### 10.10 Switch
- Track 51 × 31 (iOS geometry), hit 44.
- Off: track surface-3 with a 1 px line-strong edge. On: track accent.
- Knob 27, surface-1, elevation 1.
- Native `<input type="checkbox" role="switch">` inside the root.

| State | Behaviour |
| --- | --- |
| Rest | As above |
| Pressed | Knob widens to 31 |
| Toggled | Knob travels on `--k-spring` `--k-dur-4`; Adjust haptic on the toggle |
| Focus | Ring per §10.0 |
| Disabled | 40 % opacity on the track, but the label stays at ink-3 |
| Loading | When the setting saves remotely: the knob is at its new position and a 16 px spinner appears beside the label |
| Error | The knob travels back and an inline danger Footnote says `switch.save_failed`. **No second haptic**: the toggle already fired Adjust (§15) |

### 10.11 Stepper
- Two 44 circular buttons (`remove`, `add`, surface-2) with a value between them, min-width 32.
- **The value is a button** (Heading, tabular): tapping it opens the cash keypad (or a numeric field on desktop) to type the quantity. The steppers are for small corrections.
- In RTL, − is at the start (right).

| State | Behaviour |
| --- | --- |
| Rest | As above |
| Pressed | Cap surface-3; Adjust haptic (§15: on pointerup when the stepper sits in a scroller, which is every stepper in the kit) |
| Focus | Ring per button |
| Disabled | At its bound: − at the sent quantity for sent lines (§11), + at the stock limit |
| Loading | n/a (local) |
| Error | Stock exceeded: the value shakes once (`--k-dur-6`), Footnote `stepper.only_left` |

A step from 1 to 0 on an unsent line is a Remove (§11) and fires **only** Adjust (§15).

### 10.12 Banner (inline, persistent)
- Full width inside its container; radius 12; padding 12 × 16.
- Tinted fill (warning, danger, info or accent tint) with a matching ink icon 20 and a message in Callout ink-1.
- Optional **Plain** action (§10.1), one at most. No banner in this spec carries a secondary or primary button (revision 11, P5: revision 10's `sync.pair_back` was secondary M inside a banner; the store lock that replaces it is a screen, §10.26).
- Used for: offline, sync failure, demo, error in a sheet.
- Never auto-dismisses.
- States: rest, with action, dismissible (close 44, for info only).
- **Announcing (revision 10, M4; WCAG 4.1.3).** A banner that appears **without a user action** (from a poll, the 5 s autosave, an asynchronous outbox event) is a status message. Its slot is a live region present from page load and empty until needed, because VoiceOver does not announce a region inserted together with its text: `role="alert"` for danger, `role="status"` for warning, info and accent. Writing the text announces it **once**; a re-render that shows the same banner writes nothing, so a timer cannot repeat it; a different banner in the slot is announced once. A banner shown in answer to the user's own action (an error under a form after Save) is not a live region: focus or the field's error carries it (§10.9). The banners this covers today: `sync.storage_error`, `sync.not_saved` (§10.26), `ob.offline` when the connection drops on its own, and the demo banner never (it is there at load). The polite region also carries the two sync rows that ask for action, `sync.blocked` and `sync.not_synced`, once when each first applies (revision 11, M6; §10.26 item 3 has the rule).

### 10.13 Badge
- `min-width: 20; min-height: 20; padding-inline: 5`, capsule, Footnote strong, tabular. At factor 1.35 it grows to 24 (§6.4).
- Count badges: danger-solid with on-danger text (6.47 / 5.12). **One exception (revision 11, P6):** the sync indicator's `sync.not_synced` count is warning-solid with on-warning text (9.61), so its badge matches its warning icon; §10.26 item 3 gives each row's badge and the rule for the rail's single badge.
- In-bill quantity badge on tiles: 28 circle, accent with on-accent text.
- "99+" above 99.
- `aria-label` on the host from `badge.new` ("Kitchen, 3 new").
- **What the Kitchen badge counts (revision 7, M8): New tickets only**, the lane the kitchen has not started, which is what "new" says to the eye and to VoiceOver alike. In the fixture that is 3 (tickets 48, 49 and 50); the 6 Preparing (42 to 47) and the 2 Ready are not counted. Revision 6 drew 9, every active ticket, under a label that said "9 new". Preparing tickets are the kitchen's business and show on the KDS header (§18.7), not on the till's rail. Check 5 asserts the badge equals the New count, and mutation 37 draws 9.

### 10.14 Avatar
- 40 (rows) or 56 (profile).
- Initials in Footnote strong, ink-1 on surface-3 (14.66 / 12.36), or the photo.
- Never colour-coded by person.
- Decorative when the name is beside it (`aria-hidden`).

### 10.15 Skeleton and spinner
- **Skeleton:** blocks the size of the final layout, radius 8, surface-2. Opacity pulses 1 to 0.6 over a `--k-dur-9` loop; static under reduced motion. Shown only after 150 ms. `aria-busy` on the container.
- **Spinner:** 20 (inline) or 32 (page), a 2 px accent arc rotating once per `--k-dur-9`. Reduced motion: a static `progress_activity` icon and the word "Loading".
- Both carry `data-k-loop`, which `motion-park-test` exempts (§14.5).

### 10.16 Empty state
- **Anatomy:** icon 40 in a 72 surface-2 circle; title (Heading); body (Callout ink-2, ≤ 2 lines, max 320); at most one action.

| Variant | Example | Action |
| --- | --- | --- |
| First use | `menu.empty.title` / `menu.empty.body` | Primary `menu.empty.action`, when it is the only way forward |
| Filtered | `orders.empty_refunds` | Plain `action.clear_filter` |
| Error | `orders.load_failed` | Secondary `action.try_again` |
| Offline | `wifi_off`, `state.offline_title` / `state.offline_body` | None; automatic retry |

### 10.17 Toast
- Inverse capsule, min-height 48, max width 440, elevation 2; in dark, the raised `#323A36` capsule with a 1 px line-strong edge (§5.2).
- Status icon 20 in inverse-accent or inverse-danger.
- Message in Callout (≤ 2 lines); optional action in inverse-accent.
- Bottom-centre, 16 above the tab capsule, bill bar or sticky footer, with the grid's side margin. **It never covers a primary.**
- Shows **finished** actions only. Progress and "Retrying" never appear in a toast.
- One at a time; duplicates collapse to "×2".
- `role="status"`, polite.

| State | Behaviour |
| --- | --- |
| Info | `--k-dur-toast` (4000) |
| With action (Undo) | `--k-dur-toast-action` (8000). The timer **pauses** while the toast is touched or focused, and while VoiceOver runs (bridge, §16) |
| Every Undo | Also reachable without a timer from the object's history (bill "Recent changes", KDS "History") |
| Dismiss | Swipe down past 24 pt, or a downward fling over 300 pt/s (§14.7); it then leaves over `--k-dur-2` exit |

No haptic, ever (§15). The shipped `kiwi:toast` haptic hook is removed at stage 1 (§20.3).

### 10.18 Page header
- **Phone, reading screens** (Home, Orders, Report, Customers): an inline title (Body strong) centred in the nav bar, or the venue switcher on Home. **No large title**, so the key figure stays the largest text (Principle 1).
- **Phone, task and settings screens:** a large title (Title) collapses to the inline title after 44 of scroll, on chrome. Leading back chevron 44; at most 2 trailing icon buttons.
- **iPad and desktop:** title (Heading) on the leading edge with a 24 top inset; actions on the trailing edge.

| State | Behaviour |
| --- | --- |
| Loading | Title shows; the subtitle is a skeleton |
| Offline | Warning-tint "Offline" capsule after the title |
| Demo | Warning-tint "Demo data" capsule after the title |

### 10.19 Date button and date-range picker
- **Date button:** a Footnote button with `today` 16, the resolved range ("Today · Monday 12 October") and `expand_more` 16, ink-2, hit 44. It opens the picker.
- **Range presets:** a segmented control (§10.6, radiogroup) "Today · Yesterday · 7 days · 30 days", full content width.
- **Picker content:** a medium sheet on phone, a popover on iPad and desktop.
  - Presets as list rows: Today, Yesterday, This week, 7 days, 30 days, This month.
  - A month grid with day cells of 44 and tabular numbers, mirrored in AR. Start and end show the lens paint.
  - **The range between them has two cues:** an accent-tint band (1.17 / 1.33 against s1, decorative) **and** 1 px line-strong edges along its top and bottom (3.52 / 3.69 against s1), with in-range day numbers in ink-1 strong. Each day also announces `range.in_range`.
  - Primary "Show 3 Oct to 12 Oct".
- **Business-day note** (Footnote ink-2), built from the store's cutoff: `range.days_run` with start = cutoff and end = cutoff minus one minute ("Days run 05:00 to 04:59." for cutoff 5, "Days run 03:00 to 02:59." for cutoff 3), or `range.days_calendar` for cutoff 0.
- States: focus (inset ring per day), disabled (future days ink-3), error (end before start blocks the primary with `range.end_before_start`).

### 10.20 Navigation

**Phone tab capsule:**
- min-height 62; side margins equal to the grid margin (16 below 402 wide, 20 at ≥ 402); bottom at safe area + 8; chrome; capsule (31); elevation 2.
- 4 or 5 items: icon 24 over a Footnote label (§6.2), labels from `nav.*` and `till.nav.*`. Items are `flex: 1 0 auto` with a minimum of 44 and of their label width plus 16, so a long label ("Commandes", 75.0 at 13 px in Footnote 500, Inter Tight) takes the room it needs and the rest is shared. They abut as one group (`data-k-group`).
  - Unselected: outlined icon and label in ink-2.
  - Selected: the lens paint behind the item, the same outlined icon in accent-ink, label in ink-1 at 600. Three cues, none of them the icon's fill.
- `role="tablist"` is **not** used: it is navigation (`<nav>` with links and `aria-current="page"`).
- Choose haptic on change (the brief's map: tab change is selection).
- Hidden in full-screen flows.
- Dynamic Type per §6.4. In icon-only mode a long press opens a **label HUD**: an inverse popover with the icon at 40 and the label in Heading. It is web-drawn and does not use the native large-content viewer.

**iPad sidebar:**
- 280 wide (landscape, persistent; portrait, overlay); ground surface-2.
- Rows min-height 44 with an icon 24 and a Body label. Selected rows use the lens paint with radius 12.
- Sections (Footnote strong ink-2) are listed in §12.

**Desktop:** the same sidebar at 248, collapsible to a 72 rail with tooltips. Cmd/Ctrl-K opens search.

**Till rail:**
- 88 wide on a surface-2 ground. Items min-height 72: icon 24 over a Footnote label, lens paint 56 tall with radius 12 (`--k-r-2`), **as wide as the larger of 64 and the label plus 8**, centred. Measured (§6.6), the widest label is FR "À emporter" at 68.3, so the lens is at most 76.3 inside the 88 rail.
- Bottom slot: the cashier avatar 44 and name, which opens a popover with `till.lock` and `till.switch_cashier`.

**States:** badge (§10.13); disabled is never used (an unavailable destination is not shown); focus is an inset ring.

### 10.21 KPI tile
- **Anatomy:** a surface-1 card, radius 20, padding 16, **min-height 108**: 16 + label (Footnote, 13 × 1.35 = 17.6) + 4 + value (Title, 28 × 1.15 = 32.2) + 4 + delta (Footnote 17.6) + 16 = 107.4.
  - Label: Footnote ink-2.
  - Value: Title, tabular, with the unit in Footnote ink-2 after U+00A0.
  - Delta row: an `arrow_upward`/`arrow_downward` 16 icon and the delta in Footnote strong, **signed by §6.3's change rule** (revision 11, M5): "↓ −13 MAD", "↑ +4", "↑ +1 pt"; zero has no arrow and an unsigned 0. The arrow and the sign both carry direction, so colour is never the only cue.
- **Polarity.** Each KPI declares whether up is good, bad or neither, and the delta's colour follows the polarity, not the sign:

| KPI | Polarity | Up is shown in | Down is shown in |
| --- | --- | --- | --- |
| Revenue, Orders, Average basket, Returning customers, Margin | Up is good | accent-ink | danger |
| Refunds, Cancelled sales, Voided items, Discounts given, Cash difference (absolute) | Up is bad | danger | accent-ink |
| Card share, cash share, any mix | Neutral | ink-2 | ink-2 |

  So "Card share ↑ +1 pt" is ink-2: more card payments are neither praised nor blamed (they cost fees and save cash handling). `KiwiLedger` carries the polarity with each key, and `kpi-polarity-test` fails a tile whose colour disagrees with it.
- The baseline is named once per tile group (the compare control, §10.33), or per tile when the tile stands alone.
- **Tap opens the detail, and the value travels into its header** (shared-element recipe, §14.4).

| State | Behaviour |
| --- | --- |
| Rest, pressed (0.97), focus | |
| Loading | Skeleton |
| Empty | True zero, `chart.empty` |
| Not computable | Value hidden; `kpi.margin_needs_costs` and a Plain `kpi.add_costs` |
| Error | `state.load_failed` and `action.try_again` |
| Stale | `state.updated` with `wifi_off` 16 |
| Disabled | n/a |

### 10.22 Chart (revenue line)
- **Anatomy:**
  - Plot area at the full content width; height 160 on phones whose viewport is ≥ 800 tall, 120 below that (the 375 × 667 frame, §18.11), and 240 on iPad and desktop.
  - Today: a 2 px accent line with an 8 % accent area.
  - Baseline: ink-3 dashed 4/4 at 1.5 px.
  - Now-dot: 8 px accent with a 3 px surface-1 ring, mint in dark.
  - Hairline gridlines labelled with compact numbers (Footnote ink-2, trailing): **the band-edge gridline**, labelled with the maximum it stands for, **plus round steps below it** (revision 9, P4). The step is the smallest of 1, 2 or 5 × 10^k that gives at most three steps up to that maximum, so 10K in the fixture; a step within 18 of the band edge is left out. The fixture draws three: 30.1K at the band edge, 20K and 10K (30K would sit 0.4 below the band edge, so it is left out).
  - X axis: 4 Footnote labels on the store's business day, at the cutoff and every 6 hours after it (05:00, 11:00, 17:00, 23:00 for cutoff 5; 03:00, 09:00, 15:00, 21:00 for cutoff 3), mirrored in AR.
  - **The legend sits in a reserved band at the top of the plot area, at its start edge** (Footnote ink-2): a solid swatch `chart.legend_today` and a dashed swatch with the baseline's name in its own legend key, `chart.legend_yesterday_at` "Yesterday at 17:39" (or `chart.legend_weekday_at` "Last Monday at 17:39"). Revision 5 reused `compare.yesterday_at`, whose value is lowercase and, in Arabic, starts with the preposition ب because it continues a sentence; a legend label stands alone, so it has its own capitalised key with no preposition. **Placement is a rule, not an observation (revision 7, M4).** Revision 6 argued the top-start corner is always empty because both cumulative lines start at 0; a morning-heavy day's baseline reaches the top long before the legend's end, and the preview's SE frame drew the dashed line 3 px from it. Now: (1) the plot's top **band** is reserved for the legend, `8 + 17.55 × f` tall rounded up (26 at factor 1, 32 at 1.35), as wide as the plot; (2) the y scale maps the **larger of the two series' maxima over the whole range shown** (today so far, and the baseline over its full day) to the band's **lower edge**, and the top gridline sits there, so no point of either line can enter the band, whatever the shape of the day. **That gridline is labelled with the maximum it stands for** (revision 8, F4), in thousands with one decimal, Footnote ink-2, at the band's end edge, opposite the legend: "30.1K" in the fixture (yesterday's whole day, 30,100.00), AR "30,1 ألف"; the other gridlines are the round steps of the anatomy above (10K in the fixture), and a step closer than 18 pt to the top one is dropped so two labels never touch; (3) the legend is one line in the band (204.7 of the SE's 343 in EN at factor 1, §6.6) and, if a factor ever made it wider than the plot, it wraps to two lines and the band grows with it, never the other way round. `chart-legend-test` draws the fixture and a synthetic day whose baseline peaks at the first hour, and asserts every path point lies below the band. There is **no legend band and no "Show data" button under the chart** (revision 4's 44 band is gone, which is what lets Home's first list row clear the tab capsule, §18.1).
  - **Show data:** a tap on the chart (released within 10 pt and before the 240 ms scrub hold, §14.7) opens a sheet titled `chart.show_data` with the hours and values as a table. VoiceOver exposes the same as a custom action `chart.show_data` on the chart element, so the table is one action away without finding a tap target.
  - In dark, the line and the area use accent-ink (`#5FD9A3`, §5.4); the now-dot is mint with its surface-1 ring.
- **Scrub:**
  - On touch, holding still for 240 ms (`--k-dur-3`, §14.7) starts the scrub. A quick flick still pans (`touch-action: pan-y`, as shipped).
  - The tooltip (inverse) shows "13:00 · 3,410 MAD"; a vertical ink-3 line marks the point.
  - The Choose bracket stays open for the whole scrub, with one tick per hour bucket the finger enters: the continuous-gesture exception of Principle 5 and §15.4 (at most one tick per bucket and per 40 ms).

| State | Behaviour |
| --- | --- |
| Loading | Skeleton plot |
| Empty | Flat line at 0 with `chart.empty` |
| Error | Banner in the chart area |
| Not enough data | Baseline hidden; `compare.no_data` |
| Focus | Arrow keys step through points; the tooltip follows |

- **Accessibility:**
  - The chart is `role="img"`, with an `aria-label` from `chart.summary_down`, `chart.summary_up`, `chart.summary_same` (a change that rounds to zero, §6.3; revision 14, P8) or `chart.summary_none`, filled from the ledger: "Revenue today, 19,174 MAD at 17:39, down 1,127 MAD on yesterday at the same time. Busiest hour 13:00."
  - The `chart.show_data` custom action (and a tap) opens the table of hours and values.
  - During a scrub, the value is announced politely, at most once per 500 ms.

### 10.23 Bill panel

**Anatomy:**
- **Header:** title (Title: `floor.table`, or `orders.takeaway` with the order number); meta (Footnote ink-2: `bill.meta`); trailing icon buttons `bill.print` (`print`, 44) and `action.more` (`more_horiz`, 44), 8 apart.
- **Lines:** grouped `bill.not_sent` ("Not sent · 2", Footnote strong, accent-ink) and `bill.sent_at` ("Sent 17:28", Footnote ink-2). Each row has min-height 56:
  - qty "1×" (Callout strong, tabular, 32 wide);
  - name (Body, **wraps, never truncates**);
  - every chosen option and note (Footnote ink-2);
  - price at the trailing edge (Body, tabular).
- **Selecting a line** expands it in place (§14.4 recipe) to show a stepper, `bill.edit_options` and `bill.remove` (unsent) or `bill.void` (sent), the last as tonal danger.
- **Footer** (sticky, top hairline):
  - discount and service rows **only when non-zero and configured**, each a `data-k-part`;
  - Total: "Total" in Body ink-2, the amount in Title tabular, with `data-k-total` and parts;
  - a secondary row, M: `bill.split` and `bill.discount` (at the 320 pane it is always the toolbar form of §18.3, measured in §6.6);
  - the primary (L).
- **Events:** the panel emits one composed `kiwi:action` per control, with names namespaced by component (`k.bill.split`, `k.bill.discount`, `k.bill.print`, `k.bill.send`, `k.bill.pay`, `k.bill.line-select`, `k.bill.overflow`), as specified in §20.4.
- **Controls inside lines** (the stepper and the line actions) are rendered by the panel's own root from the shared control modules, not as nested kit elements (§20.6).

**Primary rule (one at a time):**
- While a restaurant bill has unsent lines, the primary is **`bill.send`** ("Send 2 to kitchen"; the count is the number of unsent lines, which the "Not sent · 2" header above names).
- Once everything is sent, it is **`bill.take_payment`** ("Charge 230.00 MAD").
- A quick-service merchant can set "send on payment"; the primary is then always Charge.
- The change is a label crossfade (`--k-dur-2`). The button stays full width, so its width never changes.

| State | Behaviour |
| --- | --- |
| Empty | `bill.empty.title` / `bill.empty.body`; primary disabled |
| Loading | 3-row skeleton |
| Error | Warning banner `bill.unsaved`. The bill stays usable |
| Disabled | During payment: lines in ink-3, no steppers |
| Pressed, focus | As rows |

The overflow holds `bill.recent` (undo history), `bill.transfer`, `bill.merge`, `bill.clear` (§11) and `bill.cancel_table` (§11).

### 10.24 Options sheet (modifiers)
- Opens on a **tap** for any item that has required options. Items with options show a `tune` 20 marker on the tile, and the tile's accessible name ends in ", has options" (`menu.tile_label_options`). No draft ARIA attribute carries it.
- **Anatomy:**
  - Title (Heading) with the price.
  - Groups: a header in Footnote strong, `options.required` or `options.optional`.
  - Rows of min-height 52 with a native radio or checkbox. **Nothing is preselected.**
  - An optional note field.
  - A quantity stepper.
  - Primary `options.add`, disabled until every required group is answered, with a Footnote naming the missing group.
- A long press on any tile (500 ms, §14.7) is a shortcut to the same sheet. It is never the only way.

| State | Behaviour |
| --- | --- |
| Focus | Rows in order |
| Error | Out of stock: option row ink-3 with "Sold out" |
| Loading, empty | n/a |

### 10.25 Cash keypad
- A 3 × 4 grid. Keys: `1` to `9`, `,` or `.` per locale (`count.next` in count mode, §18.9), `0`, and delete. `direction: ltr`. The keys are one contiguous group (`data-k-group`).
- Digits in **Title**, tabular, on a surface-2 cap, radius 12 (`--k-r-2`) on iPad; flush cells with hairlines on phone, as the iOS keypad.
- **Key geometry is set by the container**, never fixed. Key width = (content width − 2 × gap) / 3:

| Container | Content width | Gaps (horizontal / vertical) | Key | Where |
| --- | --- | --- | --- | --- |
| Bill pane 432 (≥ 1180 wide) | 384 | 12 / 8 | **120** × 72 | Payment, discount and split on iPad 11 and 13 landscape (§13.3) |
| Bill pane 360 (1000 to 1179) | 312 | 12 / 8 | **96** × 72 | iPad 13 portrait, iPad mini landscape |
| Bill pane 320 (600 to 999) | 272 | 12 / 8 | **82.7** × 72 | iPad mini and iPad 11 portrait |
| Cash-count keypad column (720 sheet) | 288 | 12 / 8 | **88** × 72 | §18.9 |
| Phone (any sheet or docked) | the sheet's content width | 0 / 0 | a third of the width × 64 (133.3 on a 440 phone, 114.3 on the SE) | Payment, discount, split, cash count |

  A key is never narrower than 72 on iPad; no container in §13.3 goes below 82.7. **A popover never holds a keypad** (§10.4): on iPad the discount and the split push inside the bill pane, like the payment.
- A display above it (§10.26 and §18.9 set its step), with the unit.
- Quick chips (radiogroup), 8 apart: `pay.exact` "Exact" (accessible name `pay.exact_a11y`, "Exact amount, 230.00 MAD"), then the next two round amounts (computed). Measured in §6.6: at most 257.5 of 272 in the narrowest pane (251.1 in EN and FR, 257.5 in AR).
- The keypad never scrolls and is excluded from sheet drags (§10.3), so its Adjust haptic fires on pointerdown (§15).
- States: pressed (surface-3); disabled (amount is locked); error (more than 2 decimals is ignored, with a gentle shake).

### 10.26 Payment pane

**Header:** `pay.title` ("Table 4 · Payment", Heading).

**Key figure:** `pay.amount_due` (Footnote ink-2) over "230.00 MAD" in **Title**, `data-key-figure`. It is the only Title-or-larger figure in the pane apart from the keypad digits, which share its step (§2 allows equal).

**Tip (kept from the shipped till; revision 5 dropped it by omission, which was a bug, not a decision).** Today the card and cash modals both carry a tip selector, "Sans pourboire · 5 % · 10 % · 15 % · Autre" (`kiwi-caisse.html:11108-11114`, markup at `:6710` and `:6746`), the tip is `money(base × pct / 100)` to the cent (`payTipAmount`, `:11026-11030`), "Autre" is a custom **percentage** from 0 to 100 (`:11023`), the card is authorised for base + tip (`:11320`), and the tip is recorded **beside** the amount, never inside it (`recordSale(tenderBase, method, label, tenderTip, …)`, `:11388`; `tip: money(tip)` on the journal entry, `:14590`). The direction keeps every one of those rules and changes only the layout:
- **A Tip row** (list row, min-height 64, its own group) sits between the key figure and the method list: `pay.tip` (Body) with the current choice as its trailing value (Body ink-2: `pay.tip.none` "No tip" at rest, or "10% · 23.00 MAD") and `chevron_right` 20, mirrored in Arabic. It is a row and not a chip strip because the five chips measure 356.9 in EN, 429.1 in FR and 424.0 in AR at factor 1 (§6.6), so they would wrap or scroll in every pane below 432 and in every language but English at 432, and the payment pane's geometry would then depend on the language.
- **Tapping it** opens a popover (§10.4) anchored to the row, holding a radiogroup of five rows (min-height 52): `pay.tip.none` (selected by default; no tip is preselected for the guest), then 5 %, 10 % and 15 % as `pay.tip.pct` "10% · 23.00 MAD" (the amount computed live from the base, so the cashier reads what the guest pays), then `pay.tip.other` "Other percentage", accepting 0 to 100 in steps of 0.5, as shipped. Choosing a preset row (none, 5 %, 10 %, 15 %) closes the popover and fires **Choose** (§15.1), and nothing else in the pane moves. **"Other percentage" is not a choice but the way into an entry** (revision 10, P7): tapping it fires nothing and changes the pane as the next bullet says.
- **Where "Other percentage" is typed (revision 9, P7).** Never in the popover (§10.4): choosing the row closes it, and the entry happens in the pane's own keypad column. With **Cash** chosen, the keypad already in the pane (regular, compact or compact short, or the docked keypad of the phone sheet) switches to tip mode for the entry: the `pay.received` line is replaced in place by `pay.tip.other_title` "Tip percentage" with the typed value and a % suffix, the chips row is hidden with its height kept, the pinned primary reads `action.done` (it applies the tip) and the pane's Back icon cancels the entry. The Received entry is **kept, not cleared**: its digits are held while the tip is typed and come back unchanged on Done or Back, and `pay.change` and the Confirm rule are then recomputed against base + tip. With **Card**, **Other** or no method chosen there is no keypad in the pane, so one pushes inside the keypad column (`--k-dur-5`, like Split and Discount, §10.30, §10.31) with the same Back icon and `action.done` primary, and pops on either. Back leaves the tip as it was; Done applies it. **Neither fires a haptic** (revision 10, P7): Done confirms an entry, it is not one of §15.1's Choose members, and the tip row's new value is feedback enough.
- **The key figure becomes what the guest pays.** With a tip, the key figure is base + tip ("253.00 MAD") and a reserved Footnote line under it, `pay.tip_breakdown` "Bill 230.00 · Tip 23.00" (ink-2), names the parts (`data-k-part` on each, so `components-sum-test` holds the key figure to their sum). The line's 18 px slot is reserved even with no tip, so choosing one moves nothing. Cash: `pay.change` is received − (base + tip) and the Confirm stays disabled until received ≥ base + tip. Card: `pay.card.body` names base + tip, the amount the guest's terminal must show.
- **Ledger, unchanged from today and stated so it cannot drift:** `amount` stays the base and `tip` stays separate (`:11388`, `:14590`). Tips are **not revenue**: Home, Orders and the Report's revenue exclude them. The till's day report already sums them apart and puts **cash tips into the expected cash** (`assets/day-report.js:645-646` and `:719`: `round2(opening + cashSales + cashTips + movesIn - movesOut)`, where `cashSales` is already net of cash refunds, `:717`, so refunds are no term of their own, §17.5), so §18.9's count carries a `count.cash_tips` line. **The server never sees a tip today:** the Live Link sale body has no tip field (`assets/live-link.js` has no `tip` key) and neither does `functions/api/sale.js`, so the dashboard cannot show tips at all. Stage 4 adds `tipCents` to the outbox body, a nullable `tip_cents` column (default 0) and its validation in `/api/sale` (an integer from 0 to the sale's `amountCents`), and a "Tips" line in the dashboard's Report and Z; the D1 migration is written against the **live** database's columns, which lag `schema.sql`. Until that ships, the dashboard shows no tip figure rather than a zero it cannot know.

**Height.** The pane has two forms by viewport height, regular (H ≥ 1018) and compact (the summary moves over the menu pane and the keypad column keeps the bill pane), specified with every coordinate and a per-device table in §18.3 and §13.3, plus a compact-short step (56-tall keys) from 514 to 577. Nothing inside the keypad column scrolls in any form; only a desktop window under 514 scrolls the page as a whole (revision 8, F5).

**Method list** (no method is preselected): rows of min-height 64, `role="radiogroup"`: `pay.cash`, `pay.card`, `pay.other`. Choosing a row fires **Choose** (§15.1), once per change; choosing the row already chosen fires nothing (revision 8, F13).

**Cash:**
- `pay.received` ("Received 250.00 MAD") display in **Heading**, keypad and chips.
- `pay.change` ("Change 20.00 MAD") in Heading.
- Primary `pay.cash.confirm` ("Confirm cash payment"). The amount due is the key figure and the change is the Heading directly above the button, so the button names the act; revision 4's "Confirm 230.00 MAD cash · change 20.00 MAD" measured 390 in a 232 budget and is withdrawn (§6.6). Disabled until received ≥ due, with `pay.cash.short` as its reason.

**Card is record-only.** Kiwi does not drive a terminal (`assets/caisse-hardware.js:26-38` returns `recordOnly: true, externalTerminal: true`).
- Body `pay.card.body`.
- Primary `pay.card.confirm`; secondary `action.back`.
- **There is no "declined" state and no live terminal state.** If the terminal declines, the cashier goes Back and picks another method.
- Hotel pre-authorisation fails closed, as shipped, with the banner `pay.preauth`.

**What "paid" means: the durable local record, not the server.** The till is offline-first, and the design keeps it that way:
1. Confirm writes the sale through `recordSale` (`kiwi-caisse.html:11388-11390`), which puts it in the till's journal **and** in the IndexedDB sale outbox with a stable id (`assets/live-link.js:232-241`). `/api/sale` inserts by that id with `INSERT OR IGNORE`, so a retry can never record the sale twice.
2. **The paid moment starts the frame `recordSale` returns the record**, exactly as today (`kiwi-caisse.html:11401-11404`), whether the till is online or not. The Paid haptic fires on that same frame (§15.3). No network round trip sits between Confirm and the paid moment, so the ≤ 200 ms interaction budget (§19) holds offline.
3. **If nothing was recorded**, there is no paid moment: the pane stays, shows `pay.not_recorded` as an inline error above the primary, fires Failed, and the cashier can try again. That happens in one case only: `recordSale` returns nothing (the till throws `sale-not-recorded`, `kiwi-caisse.html:11390`), which it does **before** `journal.push` (`:14692`), at its amount guard (`:14560`). Nothing is in the journal or the outbox, so the second Confirm books the sale once. A share of a split does the same: when its `recordSale` returns nothing, `markSplitPartPaid` keeps the share unpaid (`:13696-13701`) and the pane shows `pay.not_recorded` and fires Failed, never Paid (§15.3).
   - **Recorded on this till, not synced (revision 7, B1).** Once `journal.push` (`:14692`) and the till's autosave `persistShift` (`:14697`) have run, the sale **is** recorded, whatever the outbox answers next. If `KiwiLive.postSale` then refuses it (`{ok:false, reason:'queue-storage-full'}` from `enqueueMoneyBody`, `live-link.js:764`, `:767`, `:793`, `:799`) or throws (`sale-enqueue-failed`), `recordSale` marks the entry `saleSyncPending` with that `saleSyncError` and still returns it (`kiwi-caisse.html:14735-14746`). So **the paid moment runs, with Paid and the paid sound**, as shipped; what it says under the amount depends on whether the till's own autosave landed (next bullet). Revision 6 called this state "not recorded" and offered "Try again", which would have booked a takeaway twice (a takeaway has no table to dedupe on) and, on a table, returned the already-paid receipt (`paidReceiptForCurrentTable`, `:14550-14553`) without queueing it again. **Revision 7 offers no retry of the sale**: nothing on screen leads back to `recordSale` for a sale that is in the journal.
   - **The sync state, in one place (revision 10).** Revisions 8 and 9 added states one finding at a time, and the round 10 critique found the gaps where they met: fields that did not survive a reload, a state with no exit, a replay that could book one store's sale into another. Revision 10 states the whole lifecycle here, and removes two fields rather than adding more: `entry.savedLocally` (revision 8) and `saleSyncWaiting` (revision 9) are gone, because the journal restore drops unlisted keys (`kiwi-caisse.html:22863-22864`), so neither survived a reload, and both are derived better from the values below. Every rule elsewhere in this spec that touches sync reads these tables.

     **Entry fields** (in the journal, kept by the restore whitelist at `:22863-22864`):

     | Field | Set | Cleared | Persisted |
     | --- | --- | --- | --- |
     | `merchant` (new, revision 10, M3) | At `journal.push`, to `shiftMerchant`, the store the open service belongs to (`:15752`). Never rewritten | Never | Added to the whitelist. An entry restored from an older journal takes the service blob's own `merchant` (`:22726`). **Revision 14, P1: revision 11's claim that an unpaired till restores any blob, and so shows the unpaired lock, is false and is withdrawn.** The stored service is keyed per store (`kcStoreKey`, `kiwi-caisse.html:22484-22487`). `migrateLegacyShift` moves a legacy blob that names a store into that store's key (`:22794-22807`), so an unpaired till only ever reads a blob with no store. `restoreShift` never sets `shiftMerchant`, which is assigned only at `:15716`, `:15752` and `:22690`. **The unpaired variant is reached one way only: `unpair()` with a service open** |
     | `saleSyncPending` (shipped) | At the sale, for every local sale `postSale` would send | When `kiwi:money-sync` reports the sale accepted (shipped), or at once when `postSale` answers "not applicable" (below) | Yes |
     | `serverSaleId` (shipped) | When `postSale` queues the entry | Never | Yes |
     | `saleSyncError` (shipped) | Only on a refusal: `postSale` answers `{ok:false}` (its `reason`) or throws (`sale-enqueue-failed`) | When a replay queues the entry | Yes. **A stored `'sale-sync-unavailable'` is dropped on restore**: it was written for every `undefined` answer, never for a refusal, and nothing writes it from stage 4 |

     **Persisted means "in `localStorage`", and that stops at a re-pair (revision 11, M2; revision 21).** While the store lock shows (below), `persistShift` refuses to write the service (its merchant-mismatch return), so an entry written then lives in the page's memory only. What was saved before the switch is in the set-aside copy that `762bb255` ships (below).

     **Till values** (runtime, never persisted, derived again after a reload):
     - **`tillSave`**, the last answer of `persistShift`: `true` when `setItem` landed, `false` from its catch (`:22792`), `'other-store'` from the merchant-mismatch return (`:22699-22710`), which, with a service open, is the store lock's condition seen from `persistShift`; the early return with no service open leaves it unchanged. Every call sets it: `recordSale`'s **four** (`:14697`; `:14733`, the queued branch, whose answer the online-queued paid line reads; `:14737`; `:14744`; revision 11, P1) and the 5 s autosave (`setInterval(() => { persistShift(); saveProvisional(); }, 5000)`, `:23159`). After a reload it is `true` until the first autosave answers, since the service was just read back from storage.
     - **`storageError`**, the outbox's own flag (`kiwi:sale-queue`, `live-link.js:250`).
     - **`KiwiLive.isOn()` and `KiwiLive.merchant()`** (`live-link.js:1753-1754`).

     **How a sale meets the outbox** (`recordSale`, and the replay `reconcileJournalSales`, `:16074`, the same way):
     1. **The merchant guard (revision 10, M3; revision 11, P3).** `postSale` is called only when `entry.merchant !== '' && entry.merchant === KiwiLive.merchant()` and the store lock is not up. Otherwise the entry stays pending, with no error, and waits. **The non-empty test matters:** revision 10 wrote "equals `KiwiLive.merchant()`", which admits `'' === ''`; `postSale` then answers `undefined` for want of a tenant (`live-link.js:843`), rule 3 would read that as "not applicable" and clear `saleSyncPending`, and the sale would never be sent. With the guard, a till whose `KiwiLive.merchant()` has not resolved holds the entry and shows row 5 (`sync.waiting_store`) until it does. Before `762bb255`, nothing guarded this: `postSale` stamped the **current** `merchant()` on the body (`live-link.js:843`, `:910`) and derived its stable id from it, so after a re-pair the 5 s heartbeat (`saveProvisional`, `:16186-16194`) would have posted the old store's pending sales to the new store under new ids. `762bb255` now writes each journal line's store and makes `postSale` refuse a line of another store (`tenantHold`, below); the guard stays, so a held entry is not recorded as refused. The guard also covers the boot window before `merchant()` resolves (`:843`), which revision 9 handled with a separate field.
     2. **`undefined` with `!KiwiLive.isOn()`** (rules 2 to 5 apply only to an entry the guard let through): Live Link is off (`:806`; `on()` falls back to `realEnv()`, `:64-71`, so it is off on every demo till). Pending, no error, so switching Live Link on later sends it by the same id.
     3. **`undefined` otherwise**: an amount `postSale` does not send (`:837`). Not applicable: `saleSyncPending` is cleared at once, and nothing ever shows for it.
     4. **`{ok:true, queued:true}`**: `serverSaleId` set, pending until accepted (shipped).
     5. **`{ok:false}` or a throw**: refused. Pending, with the `saleSyncError`.

     An entry that already holds a refusal when Live Link is switched off keeps it (it was a real refusal), but nothing replays while Live Link is off, and the indicator shows only `sync.off`; switching Live Link on brings its count back and the heartbeat sends it.

     **The store lock comes first, and it is not a row (revision 21, F2: written from what `main` ships in `762bb255`).** `assets/till-tenant.js@762bb255` holds the lock. This direction adopts it and its copy, and the store-lock item below lists the few places it differs, each with a reason. It shows when, and only when, `KiwiTillTenant.mismatch()` holds (`till-tenant.js@762bb255:43`): the open service's store is not empty and is not the store the till is paired with (`''` when unpaired). The till's hook gives the open service's store as `shiftMerchant` while `shiftOpenedAt` is set, and `''` otherwise (`kiwi-caisse.html@762bb255:23057-23061`), so an idle till and a service with no store never lock. The lock is checked every 700 ms and on each `kiwi-paired` and `storage` event (`till-tenant.js@762bb255:297-316`). Check 15 of §18.0 runs the same predicate on every case it holds.

     While the lock is up, the rows below are computed but drawn under it.

     **What the till shows: one function, `syncRows()`,** derives the rows below from the values above. **The rows are always sorted by their number in this table, and every row that applies is listed; no row folds another away** (revision 11, M4: revision 10 stated this, but its check 15 model emitted rows in nearly the reverse order and dropped `sync.not_saved` when storage was full). The rows feed the rail icon, the popover, the phone's More row and the banner. The rail shows the first row's icon. **Badges (revision 11, P6):** only the two rows that ask for an action carry a count badge, each in its own colour (column below); every other row shows its icon alone. The rail carries **one** badge: the count of the first of rows 3 and 4 that applies, in that row's colour, even when the first row (whose icon the rail shows) has no badge of its own; so storage full with two refused sales shows the danger `error` icon with a warning-solid "2". The phone's More tab carries a dot while the first row is danger or warning. **The indicator is visible while any of rows 1 to 7 applies**, whether or not the outbox is empty, and for `--k-dur-toast` after `sync.all_sent`; otherwise the rail slot is empty.

     | # | Row | When | Icon 16, colour | Count badge (§10.13) | Banner (§10.12) | Announced (§14.6) |
     | --- | --- | --- | --- | --- | --- | --- |
     | 1 | `sync.storage_error` | `storageError`, or an entry whose `saleSyncError` is `queue-storage-full` | `error`, danger | None | Yes, first in priority | Once, `role="alert"` |
     | 2 | `sync.not_saved` | `tillSave` is `false` | `error`, danger | None | Yes, unless row 1 holds it | Once, `role="alert"` |
     | 3 | `sync.blocked`, opening the sheet of blocked sales | Outbox `blocked` > 0 | `error`, danger | danger-solid, on-danger text (6.47) | No | **Once, `role="status"`, when it first applies** (revision 11, M6) |
     | 4 | `sync.not_synced`, with `sync.send_now` | Live Link on, and entries with a `saleSyncError` whose `merchant` is the paired store | `warning`, warning | **warning-solid, on-warning text (9.61)** (revision 11, P6: revision 10 gave it the danger badge) | No | **Once, `role="status"`, when it first applies** (revision 11, M6) |
     | 5 | `sync.waiting_store` | Live Link on, `KiwiLive.merchant()` still empty, and pending entries with no `serverSaleId` | `storefront`, ink-2 | None | No | No |
     | 6 | `sync.waiting` | Offline, outbox `pending` > 0 | `wifi_off`, ink-2 | None | No | No |
     | 7 | `sync.sending` | Online, outbox `sending` > 0 | `upload`, ink-2 | None | No | No |
     | 8 | `sync.off` | `!KiwiLive.isOn()` | `info`, ink-2; the phone's More row only, never on the rail | None | No | No |
     | 9 | `sync.all_sent` | For `--k-dur-toast` after the outbox empties | `task_alt`, ink-2 | None | No | No |

     **Every held entry is shown (revision 11, P2; revision 13, P6).** The merchant guard (rule 1 above) holds an entry for exactly two reasons, and each has a place on screen: the store lock (the entry belongs to the open service, whose store is not the paired one) or row 5 (`KiwiLive.merchant()` has not resolved yet). Revision 12's third reason, a parked service, is gone with the parked state (revision 13). **An entry with no store is held too, and nothing shows it, on purpose (revision 14, P3):** it comes from a service with no store (above), it is no store's sale, and it is never sent. An entry of another store than the open service's cannot exist, because `merchant` is written from `shiftMerchant` at `journal.push` and the journal belongs to the service; revision 10's fixture case `older-store-entry` (an entry of store A under a service of store B) described an impossible state that no row showed, and is replaced by check 15's invariant: every held entry is accounted for by the lock or by row 5 (§18.0, mutation 103).

     **Combining.** The popover lists every row that applies, in row order. There is at most **one banner**, the first of rows 1 and 2, and the other stays listed as a row. So a till out of storage whose autosave also failed shows the `sync.storage_error` banner, with `sync.storage_error` and `sync.not_saved` both listed in the popover, in that order (check 15's `storage-full` case). Under the store lock the rows, the banner and the badge are under the lock: nothing is drawn or announced until the lock leaves, and then the rows that still apply are drawn as usual.

     **Announcing (revision 10, M4; revision 11, M6).** Two live regions, both present from page load and empty until needed (VoiceOver does not announce a region inserted together with its text): an **assertive** one (`role="alert"`) for the banner of rows 1 and 2, and a **polite** one (`role="status"`) for everything else this section announces. The rule is the same for both: a row's text is written **once, when the row first applies**; a re-render with the same rows writes nothing, so the 5 s autosave never repeats it; **a count change while the row applies writes nothing** (2 refused sales becoming 3 is not announced; the badge and the popover carry it); a row that clears and later applies again is announced again. Rows 3 and 4 are announced in the polite region because each reports errors the cashier is asked to act on (WCAG 4.1.3), which a sighted cashier sees as a badge appearing on the rail. When the last of rows 1 and 2 clears, the polite region says `sync.saved_again` "This till is saving its sales again." once. Rows 5 to 9 never announce. **While the store lock shows, neither of these two regions is written** (revision 11, P4): the lock is a screen, and its heading carries it (below).

     **The store lock: what the cashier sees and does (revision 21, F2: rewritten from `762bb255`).** Revisions 11 to 20 designed a lock before one shipped. `main` now ships one in `762bb255`, tested by `tools/till-repair-lock-browser-test.mjs` (39 checks, wired into `check.js`). This item starts from it: what it does, its copy mapped to keys, and each place this direction differs, with a reason. Where the shipped flow is good enough it is adopted, and the earlier design it replaces is listed once, at the end.

     - **Why it exists.** Pairing a till with another store, or unpairing it, runs the tenant purge, which removes the stored service of the store it leaves (`assets/pairing-commit.js`; `unpair`, `caisse-pairing.js@762bb255:383-400`). A change of paired store restarts the page (`assets/pos-dispatch.js@762bb255:113-120`), so a service stays open in memory after an **unpair** during a service, and for the **moment before that restart**. Anything the till sent then would carry the old store's service to the new one.
     - **The service is set aside first (shipped).** Before the purge, the service is written once more and copied to `kiwiQuarantine:shift:<store>`, a key the purge does not touch (`quarantineService`, `caisse-pairing.js@762bb255:224`, `:388`; `quarantine`, `till-tenant.js@762bb255:68-78`). Pairing back to that store returns it (`take`, `:85-92`, read by the till's restore, `kiwi-caisse.html@762bb255:23215`). A copy saved more than 12 hours ago is not returned (`MAX_AGE`, `till-tenant.js@762bb255:35`, `:59-66`), the same limit as a stored service.
     - **Nothing leaves for another store (shipped).** While `mismatch()` holds:
       - with Live Link on and a paired store, `postSale` and `postRefund` refuse with `{ok: false, reason: 'tenant-mismatch'}`, as they do for a journal line that names another store (`tenantHold`, `live-link.js@762bb255:840-848`, `:889-890`, `:1023-1024`); the till's calls for the floor, kitchen tickets, cash sessions, the print relay, the provisional report and the held-sales shelf return early (the list in `762bb255`'s commit message);
       - a net rejects `fetch`, `XMLHttpRequest` and `sendBeacon` to any same-origin path under `/api/` except `/api/pair/` (`till-tenant.js@762bb255:106-160`). It does not wrap `WebSocket`: the till's floor socket names the paired store, not the held one, and sends nothing but `ping` (`assets/live-socket.js@762bb255:83-97`);
       - only `kiwi-caisse.html` loads the module, and only the till sets the hook it reads, so no other page is affected.
     - **The screen (shipped, `till-tenant.js@762bb255:260-288`).** A full-screen `alertdialog` over the till, with everything else `inert` (`:247-258`): the `lock` icon, the title, the body, the next step, a smaller line on reloading, and **one button** with the `link` icon. The button hides the screen and opens the pairing pad for the held store (`pairBack`, `:289-296`, through `repairWithCode`, `caisse-pairing.js@762bb255:497-507`), whose prompt and foot name that store. While that pad is open, the screen stays hidden behind it (`till-tenant.js@762bb255:307`).
     - **What a code on that pad does.**
       - **The held store's code** pairs the till back, and `mismatch()` ends. After an unpair, with no restart since, the service carries on in place: the screen goes at the next check, the autosave writes the service again and the set-aside copy is dropped (`kiwi-caisse.html@762bb255:23065-23076`). After a restart, pairing back restarts the page again and the restore takes the set-aside copy (`:23081`, `:23215`). Either way the pad then asks for a staff code as every pairing does (`bootWithPin`, `caisse-pairing.js@762bb255:557`), with every state of §10.2's till lock, including its row for a staff list that cannot load.
       - **Another store's code** pairs the till with that store, and the page restarts as that store's till. The held service stays set aside on the device, and comes back if the till is paired back to its store within the 12 hours.
       - **No answer, a wrong code, too many tries:** §10.2's pairing states (difference 1 below).
     - **Reloading (shipped, and said on the screen).** A reload opens the paired store's till, or the pairing pad when unpaired, without the held service, which stays set aside as above. So a till that cannot be paired back now is not stuck behind the lock. Shipped, the screen only describes the reload; the kit gives it a button (difference 6).
     - **The copy, mapped to keys (§9.6).** Every line of the shipped `TEXT` (`till-tenant.js@762bb255:163-194`) becomes a kit key, with `{store}` for `{a}`. The keys keep the shipped words in EN, FR and AR except where this table says "changed". As everywhere in §9.6, the apostrophe is U+0027, not the shipped U+2019, and AR's بـ joins its argument with no space.

       | Shipped `TEXT` | Key | Kept or changed |
       | --- | --- | --- |
       | `title` | `lock.store.title` | Kept |
       | `body` | `lock.store.body` | Changed: it says the till is no longer paired with {store}, true after a re-pair and after an unpair; the shipped line says the till changed store (in AR, that it was paired with another store), which an unpair does not do. AR says الحسابات for bills, where it says الفواتير (the glossary's bill, §9.1) |
       | `next` | `lock.store.next` | Kept |
       | `reload` | `lock.store.reload` | Changed: it names the second action instead of a page reload (difference 6), and the till it opens is this one, where the shipped line says "the new store's till", which an unpair does not have; "up to 12 hours", because the limit counts from the service's last save |
       | (none) | `lock.store.open_without` | New: the second action (difference 6) |
       | (none, on the pad) | `action.back` | New: the pad's Plain Back (difference 6) |
       | `action` | `lock.store.action` | Changed: "Pair back", with no store name (difference 2) |
       | `prompt` | `lock.store.prompt` | Changed: sentence case, not capitals (difference 2) |
       | `foot` | `lock.store.foot` | Kept |
       | `fallback` | `lock.store.unnamed` | Kept: it fills `{store}` when the store's name is unknown |

     - **Where this direction differs from `762bb255`, and why.**
       1. **The pad's answers.** When the network fails, the shipped pad falls back to the same-browser map and then says "Code invalide." in a toast (`caisse-pairing.js@762bb255:264`, `:560-567`). The kit uses §10.2's pairing states in the pad's message row: `pair.invalid`, `pair.no_answer` (the code is never sent again by itself, because a redeem spends it), `pair.maybe_used` and `pair.paused`. Reason: "invalid" after a network failure sends the cashier to make a new code for nothing. **It is a behaviour change too, not only copy** (revision 22, F5): on a hosted till the kit never calls the same-browser fallback, `localRedeem`, which shipped `redeem()` reaches on a throw and on a 404 or 405 (`:242-264`); a 404 or 405 is §10.2's `pin.unavailable` row, and §22 lists the removal.
       2. **Two strings.** The button says "Pair back", and the next line above it names the store, because a store name cannot be measured on a one-line control (the interpolated-names rule, §6.6). The pad's prompt is in sentence case, because the kit sets no capitals and no `text-transform` (§6.2, §9.4).
       3. **Kit styling.** Tokens, the Heading and Body roles, and the `lock` icon at 24 replace the module's inline colours and sizes (`till-tenant.js@762bb255:218-237`), so both themes and the type scale apply.
       4. **Focus.** Focus moves to the title when the screen appears (§14.4), so VoiceOver reads the title and the body once. The shipped screen sets `role="alertdialog"` and `aria-labelledby` (`:265-267`) and moves no focus.
       5. **Language.** The lock reads the kit's language, not `kiwiCaisseLang` (`:195-201`), so it follows the rest of the till.
       6. **Exits (revision 22, F2).** Shipped, the screen's only control is the pair-back button, the pad it opens has digits, C and delete and nothing else (`renderPairPad`, `caisse-pairing.js@762bb255:455-490`), and the way out without a code is a sentence about reloading. The till runs in the native iPad app and as an installed web app (`kiwi-caisse.html@319ac100:5693-5695`, the manifest and `apple-mobile-web-app-capable`; `:5976-5980`, display mode standalone), and neither shows a reload control. So the kit adds two controls and one copy change:
          - **A second action on the screen,** L secondary, full width under the primary `lock.store.action`: `lock.store.open_without`. It runs the shipped reload (`location.reload()`), with the result the Reloading item states: the paired store's till without the held service, or the pairing pad when unpaired. No confirm sheet: nothing is deleted at the tap, the service stays set aside, and `lock.store.reload`, the line just above the buttons, says for how long. Reason: a cashier with no code must be able to leave the lock on every host the till runs on.
          - **A Plain Back (`action.back`) under the keys of the pad the lock opens.** It closes the pad without sending anything, and the screen returns with focus on its title (the lock's check shows it again as soon as the pad is gone, `till-tenant.js@762bb255:297-316`). Escape does the same. While a redeem is in flight, Back is `aria-disabled` (§10.2 Rules), because the answer would land on a pad no one sees. Reason: the explanation and the second action are on the screen, and a cashier who opened the pad without a code must be able to get back to them.
          - **`lock.store.reload` names the second action, not a page reload.** Reason: the line must be true on hosts with no reload control.

       Measured at the narrowest container the lock appears in, the iPhone SE (content 343, §6.6): `lock.store.action` 71.7 / 84.7 / 65.3 (EN, FR, AR) against 275 (L primary with the `link` icon); `lock.store.open_without` 250.6 / 243.7 / 230.8 against 303 (L secondary).

       Nothing else differs.
     - **Removed, because the shipped flow covers it** (designed in revisions 11 to 20):
       - the pad on the lock screen itself, and the Why sheet (`lock.store.why`, `lock.store.why_body`, `lock.store.why_body_unpaired`): the shipped screen states the cause, the next step and the reload, and its one button opens the pad;
       - `lock.store.body_unpaired`: `lock.store.body` is written to be true whether the till was re-paired or unpaired;
       - `lock.store.memory`: the service is set aside on the device, so "only in this screen's memory" is no longer true;
       - the 409 `pair-other-store` refusal and `lock.store.wrong_store`: another store's code pairs the till with that store and the held service stays set aside, which is where a reload leads too;
       - the roster step, `rosterPending` and `lock.roster.*`: after pairing back, the till takes the store's ordinary staff gate. Pairing back needs a code created from the store's dashboard, which only the account's session or a Kiwi operator can create (`functions/api/pair/create.js@762bb255:45-56`), so the person has already proved more than a staff code proves;
       - "an open pane finishes first": the lock covers the payment pane like the rest of the till, so a payment not yet confirmed is not recorded while the lock is up. A Confirm under the lock would record a sale the till can neither save (`persistShift` refuses it, above) nor send.
     - **Requirements, as outcomes a test can observe.**

       | # | Requirement | Test |
       | --- | --- | --- |
       | R1 | While `mismatch()` holds, no `fetch`, XHR or beacon to a same-origin path under `/api/` other than `/api/pair/` leaves the page, and nothing sent carries the held store's data | `till-repair-lock-browser-test` (shipped) |
       | R2 | An idle till re-paired or unpaired never sees the lock | check 15 (`lockCases`); `tenant-gate-test` |
       | R3 | No page but the till loads the module | `tenant-gate-test` |
       | R4 | `postSale` and `postRefund` send nothing while the lock is up, or for a journal line of another store; on a page without the module they behave as before | `live-link` unit tests |
       | R5 | The held store's code, after an unpair, returns the service whole without a restart, and its sales go to that store only. Another store's code restarts the page as that store's till, with none of the held service in it, and the service stays set aside | `till-repair-lock-browser-test` (shipped) |
       | R6 | After a restart, the held service comes back when the till is paired back to its store, while its copy is less than 12 hours old | `till-repair-lock-browser-test` (shipped: pairing back after a switch); `tenant-gate-test` (a copy older than 12 hours is not restored) |
       | R7 | Focus is on the title when the screen appears; the sync regions are never written under it; the pad's message row writes §10.2's pairing states | `banner-announce-test`; `pin-announce-test` |
| R8 | **No other store's code reaches a held service.** Every code check on the till names the paired store (`59392a9c`), and the till's verifier rows for the store it leaves are deleted at the switch (`caisse-pairing.js@762bb255:225`, `:390`) | `lock-exit-test`; `offline-verifier-test` (§21.1, stage 3a) |
       | R9 | **Every exit works on every host** (revision 22, F2): with no code, `lock.store.open_without` runs the reload, which opens the paired store's till without the held service (the pairing pad when unpaired), and the service stays set aside; Back on the pad returns to the screen without a request, with focus on its title; both in the native app's web view, in the installed web app and in a browser | `lock-exit-test` |

   - **What the paid moment says under the amount (revision 8, F1; revision 10 reads `tillSave`).** `queue-storage-full` means the outbox's `localStorage` write-ahead copy failed (`live-link.js:764`, before IndexedDB is tried), and `persistShift` writes the whole service to **the same full store** (`localStorage.setItem(KC_STORE, …)`, `kiwi-caisse.html:22713`) and swallows its error (`:22792`). So "Saved on this till" can be false. The paid moment reads `tillSave` as it stands when `recordSale` returns:
     - `tillSave` not `true`, whatever the outbox did: **`sync.screen_only`** "Recorded on this screen only. Keep the till open." (Footnote strong, warning ink, `warning` 16; two lines at most in the 272 pane, §6.6). An outbox copy, when one was written, still reaches the server, but this till's journal and its Z would lose the sale on a reload, so the line says what the till itself holds;
     - `tillSave` `true` and the till offline, the outbox refused the sale, or the merchant guard is holding it for the store to resolve: `sync.saved_here` "Saved on this till";
     - `tillSave` `true` otherwise (queued online, Live Link off, not applicable): nothing; the indicator carries the rest.
     - **The receipt-return path is its own branch (revision 9, P6; revision 10, M6).** When the table's sale is already in the journal, `recordSale` returns that entry from `paidReceiptForCurrentTable` (`:14550-14553`) with no `journal.push`, no `postSale` and no `persistShift`. The outbox and the connection are therefore not inputs: the line is nothing while `tillSave` is `true` and `sync.screen_only` while it is not, and it is **never** `sync.saved_here`, offline included, because nothing new was written or queued.
     Check 15 of §18.0 runs eleven cases from the fixture (revision 11 adds the unpaired till), with the receipt-return branch modelled on its own, and mutations 55, 56, 79, 83 and 84 hold the line.
   - **What the cashier sees instead:** the persistent unsynced count (`sync.not_synced`, "{n} sales on this till only, not sent", row 4 of the table above), which counts the journal entries that carry a `saleSyncError`; and, when the reason is `queue-storage-full` or the outbox later reports `storageError`, the `sync.storage_error` banner across the till. Both stay while their condition holds. They replace the shipped toast ("Échec de synchronisation de la vente · ne fermez pas cette caisse", `:14738`, `:14745`), which was gone after a few seconds.
   - **Recovery is the shipped sync-later path, never a second sale.** `reconcileJournalSales(true)` (`:16074`) replays every journal sale whose sync is pending **and whose `merchant` is the paired store** (the guard above) through `postSale`, which derives the same stable id each time **for the same store**, and `/api/sale` inserts with `INSERT OR IGNORE`, so a replay cannot book twice. It already runs on the report heartbeat (`saveProvisional`, `:16194`) and before the Z freezes at close (`:16383`, called without `onlyMissing`). The sync popover's one action, `sync.send_now` (secondary M, `upload` 20), calls that same function and then the outbox flush, and nothing else; it is disabled while a replay runs. An entry the replay queues loses its `saleSyncError`, and the count falls.
   - **Payments are not blocked.** Neither the count nor a banner disables Confirm (the store lock is not a banner; it covers the till, the pane included, §10.26): at Confirm the cash or the card payment has already changed hands, and refusing the record would leave money taken with nothing in the books. The banner asks the cashier to keep the till open and not reload it, because with the storage full the till's own autosave (`persistShift`, whose error is swallowed at `:14697`) may not have been written either, so the open page can be the only copy until a replay succeeds.
   - **A later `storageError`** (set asynchronously in `enqueueMoneyBody`'s `catch`, `live-link.js:769-783`, after the write-ahead copy was written) is the same state from the other side: the paid moment has run, the write-ahead copy holds the sale and the legacy queue still flushes it (`flushLegacyQueue`, `:783`), and the banner shows. It never retracts a paid moment.
4. **The server acknowledgement drives the sync indicator, never the paid moment.** The outbox already publishes its state (`kiwi:sale-queue` with `{pending, sending, blocked, storageError}`, `live-link.js:250`; `kiwi:money-sync` per sale, `:224`). A server rejection after the paid moment (4xx, for example `bad-discount-reason`) shows as a blocked sale in the indicator, not as a haptic.

**Sync indicator.** iPad and desktop: an icon 24 in the rail's bottom slot, above the cashier avatar; tapping it opens a popover listing the rows that apply. Phone: a row in More, with a dot on the More tab. **Which rows, their order, icons, colours, badges, visibility and announcements are the table in item 3 above** (revision 10, P5: revision 9 hid the indicator "when the outbox is empty", which hid `sync.waiting_store`, whose entries never enter the outbox, and gave every row the danger-solid count badge of §10.13, including the neutral ones).

**Paid moment** (one choreography, the shipped one):
- A check, the amount and `pay.paid` settle over the pane for `--k-dur-8` (1100 ms, matching `native-runtime.js:2200` and its `paidTimer`).
- It never takes a tap.
- Under the amount: the three cases of item 3, read from `tillSave`, with the receipt-return path on its own branch that never says `sync.saved_here` (revision 10). Neither line claims more than the device holds.

**Receipt choice** follows in the pane and **waits**:
- `receipt.print` and `receipt.send` (shown only when messaging is set up), then `invoice.a4` with `description` (revision 23, M2: the shipped "Facture A4", `kiwi-caisse.html@319ac100:7284-7286`, which opens the sale's legal A4 invoice), secondary M, full width, in a surface-2 group on the pane. **No "Skip receipt":** `action.done` already means "no receipt", so a third button that does the same was removed.
- Primary `action.done`.
- Print and Send do not dismiss.
- Done, or starting the next sale, returns to **where the sale started**: Floor for a table, Takeaway for a takeaway.

**Cash drawer status, per transport.** A transport can prove that the kick bytes left Kiwi, never that the drawer opened. The shipped drawer test already says so ("Impulsion envoyée · tiroir fermé ? …", `printer-bridge.js:1770`). So the status line (Footnote, with a `point_of_sale` 16 icon) reads:

| Transport | While sending | Proven delivery | Failure |
| --- | --- | --- | --- |
| Local bridge (desktop, HTTP to the bridge) | `drawer.sending` | Bridge answered OK: `drawer.sent` | Bridge unreachable or error: `drawer.failed`, plus the `frReason` text (`printer-bridge.js:1620-1640`) |
| WebUSB | `drawer.sending` | `transferOut` resolved: `drawer.sent` | Rejected or device gone: `drawer.failed` |
| Web Bluetooth | `drawer.sending` | The GATT write resolved: `drawer.sent` | Rejected or disconnected: `drawer.failed` |
| Cloud relay (`/api/print/jobs`, iPad) | `drawer.sending` until the bridge acknowledges | Bridge ack: `drawer.sent` | `relay-offline`: `drawer.no_bridge`; `output-unknown-ack-timeout` or `output-unknown-after-bridge-restart`: `drawer.unknown`; `expired` or other errors: `drawer.failed` |

"Drawer open" never appears. There is **no haptic for the drawer**.

### 10.27 Cash count
Specified in §18.9.

### 10.28 Kitchen ticket and lanes
Specified in §18.7. Item actions use `.k-btn--item` (K): "Start", "Mark ready", "Mark served".

| State | Behaviour |
| --- | --- |
| Calm | No header fill; a line-strong divider |
| Warning (≥ 8 min, configurable) | warning-solid header, `timer` |
| Late (≥ 15 min) | danger-solid header, a 3 px danger-solid frame, `error` and the word "Late" |
| Pressed | Action scale 0.97 |
| Loading | Spinner in the action |
| Error | Inline, on the ticket footer: `kds.not_saved` (no toast) |
| Voided line | Struck through, with a danger "Voided" Footnote |
| Recalled | Returns to Preparing with a 2 px accent frame for `--k-dur-7` |
| Empty lane | Callout ink-3 `kds.no_new` |
| Offline | A full-width warning banner across the board |

### 10.29 Floor plan
Not redesigned: the floor plan stays as shipped (owner, 2026-10-13; §18.4).

### 10.30 Split sheet
- Opened by `bill.split` ("Split"). iPad: inside the bill pane (push, `--k-dur-5`); phone: large sheet.
- Title `split.title` ("Split the bill · 230.00 MAD") in Heading.
- Segmented (radiogroup): "Equally · By item". Nothing is charged until a share is paid.
- **Equally:** a stepper `split.shares` starting at 2 (its minimum, not a choice made for the user), max 20. Each share is the total divided by the count, **rounded down to the cent**; the cents left over are then given **one each to the first shares**. For 230.00 MAD in 3: 76.66 × 3 = 229.98, so 2 cents remain and shares 1 and 2 get one each: "Share 1 · 76.67 MAD", "Share 2 · 76.67 MAD", "Share 3 · 76.66 MAD" (`split.share_n`). The shares sum exactly to the total (`components-sum-test`), and no share differs from another by more than one cent.
- **By item:** each bill line is a row with share chips "1 2 3 +" (radiogroup per line). A line with quantity > 1 can be split across shares by quantity. A Footnote shows `split.unassigned` until every line has a share.
- Primary `split.pay_share` ("Charge share 1"; the share's amount is the selected row directly above, "Share 1 · 76.67 MAD") opens the payment pane for that share, whose key figure is the share's amount. After each share the bill shows `split.progress` and the next unpaid share becomes the primary.
- **Shared tip** (as shipped: "Pourboire commun", `kiwi-caisse.html:6628`; chips rendered by `renderTipChips`, `:13430`; percentage from `effectiveTipPct`, `:13200`). The split sheet carries the same Tip row as the payment pane, labelled `split.tip` "Shared tip", above the shares. Its tip is computed on the amount being split, after any discount (`money(splitState.total × pct / 100)`, `:13541`), and divided across the shares as shipped: **Equally** with `shareMoney` (`:13545`, defined at `:13478-13488`: rounded down to the cent, the leftover cents one each to the first shares), **By item** pro rata to the shares' amounts with `shareWeighted` (`:13611`). Either way the share tips sum exactly to the shared tip. Each share row shows its part as `split.tip_share` "Tip 7.67 MAD" (Footnote ink-2) under the share's amount.
- **Per-person tip.** When a share is paid, its payment pane (§10.26) opens with its Tip row already set to that share's part of the shared tip. The guest paying that share can change it there, which changes **that share's tip only**; the other shares keep theirs, and `split.progress` counts the shares paid ("Shares paid: 2 of 3"); the amounts actually paid, tips included, are each share's own sale. Today a share's own payment ignores the tip selector (`payTipPct` returns 0 while `splitPayCallback` is set, `:11023`); the per-person override is new and is recorded the same way, as the `tip` of that share's sale.
- **Discount and split (one rule).** A discount is applied to the bill before it is split (§10.31), so: **Equally** divides the discounted total, as above. **By item** gives each share the sum of its lines, then takes the discount off **pro rata to those sums**, in cents, with the leftover cents going by largest remainder, ties to the earlier share. That is the shipped allocator, `shareWeighted` (`:13490-13506`), so the shares always sum to the discounted total and no rounding rule is invented here. Worked: 230.00 with 10 % off (−23.00) split by item into 195.00 (tajine and salad) and 35.00 (harira) gives −19.50 and −3.50, shares 175.50 and 31.50, sum 207.00.
- States: error (a share payment fails: that share stays unpaid; the others keep their state); disabled (By item primary disabled while lines are unassigned).

### 10.31 Discount sheet
- Opened by `bill.discount`. **iPad: pushes inside the bill pane** (`--k-dur-5`), like Split, so the keypad has the pane's width (§10.25); phone: medium sheet, large when the keypad is open.
- Segmented: `discount.percent` · `discount.amount`.
- Chips (radiogroup) in Percent mode: the merchant's allowed percentages from `KiwiDiscountPolicy.percentages()` (`assets/discount-policy.js:58`; default 5, 10, 15 and 20, `kiwi-caisse.html:18069`), formatted per locale: **"5%" "10%" "15%" "20%" in EN, "5 %" in FR and AR** (§6.3). The cash keypad enters any other value in either mode. **A typed percentage is refused only when the merchant has configured a policy** (`KiwiDiscountPolicy.configured()`) and the value is not in it, with `discount.not_allowed`, exactly as the shipped till does (`kiwi-caisse.html:18160`, `:18255`); with no policy configured, any percentage up to the bill is accepted, and the chips show the defaults.
- **Reason chips (radiogroup, required, none preselected), one to one with the server's set** (`functions/api/sale.js:80`):

| Chip | Key | Sent as `discountReason` |
| --- | --- | --- |
| Goodwill gesture | `discount.reason.commercial` | `commercial` |
| Loyal customer | `discount.reason.loyal` | `loyal-customer` |
| Kitchen error | `discount.reason.kitchen` | `kitchen-error` |
| Other | `reason.other` | `other` |

  These are the four the shipped till already offers ("Geste commercial", "Client habitué", "Erreur cuisine", "Autre", `kiwi-caisse.html:7058-7061`); the change is that none is preselected (§17.10) and the code is sent instead of a label matched by regex (today's `discountReasonCode`, `kiwi-caisse.html:14508-14513`). A new reason needs a server change to `DISCOUNT_REASONS` in the same stage, never only a new chip.
- Preview line (Callout): `discount.preview` ("Discount 10% · −23.00 MAD · new total 207.00 MAD").
- **Manager approval** (§10.2), matching the shipped behaviour: **every** discount needs a manager's code (`kiwi-caisse.html:18166`). `discount.manager` shows above the primary from the first frame, and Apply opens the manager pad in place. There is no approval limit: the product has no limit setting, no schema field and no settings home for one, so none is drawn; adding one would be a new feature with its own owner decision.
- Primary `discount.apply` ("Apply −23.00 MAD"; the percentage and the new total are in the preview line directly above, so the button names only the amount, 150.7 of 232 in EN and 181.2 in FR in the narrowest pane, §6.6).
- **Where the discount goes.** Nothing is sent when Apply is tapped: the discount is held on the bill (as `tables[id].discount` is today, `kiwi-caisse.html:18045-18054`), shown in the footer as a `data-k-part` line (`discount.line`), and travels with the sale through the outbox as `grossAmountCents`, `discountAmountCents`, `discountReason` and `actorId` (`sale.js:178-190`). `actorId` is the approving manager's `staff:` id, or the cashier's when no approval was needed; it is never a 4-digit value (`bad-discount-actor`, `:190`).
- **States:** disabled until a value and a reason are chosen; error: `discount.too_large` when the value is more than the bill, `discount.not_allowed` for a refused percentage (only with a configured policy); a manager refusal shows on the pad (§10.2) and leaves the bill unchanged. Haptics: the Apply tap fires nothing; Adjust on the approval's response frame within 600 ms (§15.3).
- **Test:** `discount-reasons-test` builds a discounted sale for each of the four chips and posts it to `/api/sale` on a local Wrangler D1, asserting 200 for each, and asserts that the chip list and `DISCOUNT_REASONS` are the same set (it reads `sale.js:80`), so a chip the server would refuse cannot ship.

### 10.32 Bill bar (phone till)
- A capsule button above the tab capsule: min-height 56, side margins equal to the grid margin, bottom 8 above the capsule, accent fill, inline padding 20 (L). Three parts in one row, all on-accent Body strong: a leading `receipt_long` 20 carrying the item count as a badge; the label `bill.view` "View bill"; and the total at the trailing edge ("230.00 MAD", tabular). Its accessible name is `bill.view_a11y` ("View bill, 2 items, 230.00 MAD").
- **Fit, measured (§6.6), on the SE (343 wide):** padding 40 + icon 28 + label + 16 + amount ≤ 343. FR: 40 + 28 + 107.1 + 16 + 101.5 = 292.6; EN 250.2; AR 291.1; a four-digit total ("9 999,00 MAD", 116.2) still fits in FR at 307.3. Revision 4's one string "View bill · 2 items · 230.00 MAD" measured 320.8 in FR against 275 and is withdrawn.
- It is the phone till's one primary while the bill is closed. Opening the bill sheet (large detent) hands the primary to the sheet's footer, and the bar hides behind the scrim.
- States: hidden when the bill is empty; pressed (accent-pressed, scale 0.97); disabled during payment; loading never (local).
- Its total animates with the number roll (§14.4).

### 10.33 Compare control (Home and Report)
- One control shared by Home and Report (§17.2): the delta row itself is the button. It shows `arrow_downward` or `arrow_upward` 16, the delta in Footnote strong (danger or accent-ink), signed by §6.3's change rule as every delta is, the baseline "vs yesterday at 17:39" in Footnote ink-2, and `expand_more` 16. Hit 44 across the content width.
- **Internal gaps, stated (revision 6):** arrow 16, gap 4, delta, gap 6, baseline, gap 4, `expand_more` 16, so one line is **46 + the two texts**; there is no leading space in the baseline string (revision 5's preview drew one). When one line does not fit, the button keeps the same order in two rows: row 1 arrow, 4, delta; row 2 baseline, 4, `expand_more`; row gap 0, `min-height` 44. The thresholds per language, width and factor are measured in §6.6.
- Tapping opens a medium sheet (phone) or popover (iPad, desktop) titled `compare.title`, as a radiogroup: `compare.yesterday_same`, `compare.weekday_same` ("Last Monday at the same time"), `compare.none`. Each row shows the baseline value in its trailing slot (Body, tabular), so the baseline figure is always one tap away.
- The choice persists in `localStorage['kiwiRevCompare']` (the shipped key) and drives every delta on the page.

### 10.34 Attendance code display (till)

**What the server does today (revision 5 had it wrong).** There is **one attendance code per merchant**. `generate-attendance-code` draws a new six-digit code, different from the previous one, and **overwrites** the merchant's single `attendance-code` document (`functions/api/team/live.js:160-176`; 5-minute life, `expiresTs` at `:169`; `attendance-code-write-failed` 503 at `:175`). Clock-in accepts **only the current document's code** while it is unexpired (`functions/api/employee.js:485-497`). And the shipped modal requests a **new** code every time it opens (`assets/caisse-attendance-code.js:62`). So today, opening the code on a second till, or a till's automatic renewal, silently kills the code a first till is still showing, and an employee typing it gets `attendance-code-invalid`. Revision 5 said a new attendance code did not revoke the old one; that was false and is withdrawn.

**The design: one shared code, shown the same on every till.** Per-till codes would need a list of live codes per merchant and a change to the clock-in check, for no gain at a counter where everyone looks at the nearest screen; one code everywhere is simpler and already matches the data model.
- **A new server action, `current-attendance-code`** (stage 4, in `live.js`, beside the shipped one). Through the same `mutateDoc` compare-and-swap on `rev` (`live.js:33-54`), it returns the stored code **unchanged** when it has **more than** 60 s of life left, and only otherwise draws a new one (revision 10, P8: so the timed request below, made at exactly 60 s, always renews), exactly as `generate-attendance-code` does. Two tills renewing at the same instant cannot produce two codes: the loser's write fails on `rev`, `mutateDoc` re-reads, and its `change` now sees the winner's fresh code and returns it. The response is the shipped shape plus `{reused: true|false}`.
- **Every open sheet shows the merchant's current code.** Opening the sheet calls `current-attendance-code`, so it shows the code another till is already showing instead of replacing it. While open, the sheet asks again every 10 s and, on a timer, when **the server's clock** reaches `expiresTs − 60 s`, which is when the code is replaced (revision 11, P9: revision 10 timed it on the till's clock, and a till running ahead of the server asked while more than 60 s were left, got the old code back, and slipped to the next 10 s poll). `current-attendance-code` returns the server's `now` with `{code, createdTs, expiresTs}`, and the till schedules the timer at `receivedAt + (expiresTs − 60 s − now)` on its own monotonic clock (`performance.now()`), so the device's wall clock never enters: since `now` was stamped before the response travelled, the request always reaches the server at or after the threshold, and always renews. `attendance.changes_at` formats `expiresTs − 60 s` in the store's zone (§6.3), also independent of the device clock; a code that changed elsewhere crossfades in place (`--k-dur-2`), so two tills never show different codes for more than 10 s, and never a code the server no longer accepts for longer than that.
- **Replacing the code is deliberate and says what it does.** The secondary is `attendance.replace` "Replace the code on every till" (its own key; revision 5's "New code" is withdrawn). It opens a **Tier B confirm sheet with no reason chips** (§11; revision 6 said Tier A, whose confirm is None) with `attendance.replace_body` "The current code stops working on every till. Anyone typing it will need the new one." and calls the shipped `generate-attendance-code`. Its use is for a code that was seen by someone who should not have it.
- **Until stage 4 ships**, the till keeps today's endpoint, so opening the sheet does replace the code; the sheet then says so under the code with `attendance.replaces_notice` "Opening this code replaced any code shown on your other tills.", every time (a till cannot cheaply know how many others are paired, so the notice does not guess). Nothing claims a behaviour the server does not have.

- **Anatomy:** title `attendance.show` (Heading); `attendance.body` (Footnote ink-2); the code in **Title**, tabular, grouped "123 456" as shipped (`caisse-attendance-code.js:66`); `attendance.changes_at` (Footnote ink-2) with **the replacement time, `expiresTs − 60 s`**, to the minute (revision 10, P8: revision 9 printed `expiresTs`, a minute after the code actually changes); the secondary `attendance.replace` (L secondary; 227.3 in EN, and the French "Remplacer le code sur toutes les caisses" at 314.8 wraps to two lines on the SE by §6.4's L-button rule, §6.6).
- The code renews itself before it expires (the 60 s rule above); a renewal replaces it in place with the crossfade.

| State | Shows | Copy |
| --- | --- | --- |
| Loading (first request, or a renewal after 300 ms) | Six skeleton digit blocks the size of the code; the secondary disabled | `attendance.creating` (visually hidden, announced) |
| Changed elsewhere (a poll returns a different code) | The new code crossfades in; VoiceOver announces `attendance.changed` | `attendance.changed` |
| Shown | The code and its expiry | `attendance.body`, `attendance.changes_at` |
| Error: 503 `attendance-code-write-failed` (`:175`), 503 `auth-verification-unavailable` (`:154`), **503 `not-configured` (`:147`) and 400 `bad-json` (`:149`)** (revision 8, F11: a server without its bindings, or a malformed request, which is a till bug; neither has a cure the cashier can apply, so they share the retry state), or no connection, **when no code is showing** (opening the sheet, or after `expiresTs`) | No code; a danger Footnote; the secondary becomes `action.try_again` | `attendance.failed` |
| The same errors on a **refresh poll** (the 10 s poll or the timed one at `expiresTs − 60 s`) while a code is showing (revision 9, P9) | The code **stays**, and the `attendance.changes_at` line is **replaced** by an inline Footnote (ink-2, `info` 16): `attendance.refresh_failed` "Couldn't check for a newer code. This one expires at {time}.", `{time}` from the shown code's `expiresTs`. One time is on the sheet, never two (revision 10, P8): a till that cannot reach the server cannot renew at `expiresTs − 60 s`, so the replacement time would be false, and the expiry is the time that still holds. The poll keeps running; the first poll that answers removes the line (or crossfades a changed code in). At `expiresTs` the code is removed and the state above takes over, so the till never shows a code past its own expiry. The line does not claim the code still works: another till may have replaced it | `attendance.refresh_failed` |
| 402 `subscription-required` (`:155`) | No code; no retry | `access.subscription` |
| 403 `store-suspended` (`:156`) | No code; no retry | `access.suspended` |
| 403 `forbidden-merchant` (`:152`) | No code; secondary `pin.pair_till` | `attendance.unpaired` (not `pin.unpaired`, whose "to unlock" is wrong here) |
| Empty | n/a (a code is requested on open) | |

- No haptic: showing a code is not a commit (§15.6).

### 10.35 Printer code display
- In the till's This device › Printer: `printer.code.title` requests a code from `POST /api/print/bridges {action:'pair-code'}`, which answers `{ok, code, expires_ts}` (`functions/api/print/bridges.js:152-163`). The code is shown in **Title**, tabular, and `printer.code.body` with the time from `expires_ts`.
- Secondary `printer.code.new` (a new code revokes the previous one, `bridges.js:154-155`).
- Nothing is typed on this screen; the bridge redeems the code (`bridges.js:112-123`).

| State | Shows | Copy |
| --- | --- | --- |
| Loading | Six skeleton digit blocks; secondary disabled | `printer.code.creating` |
| Shown | The code and its expiry | `printer.code.body` |
| Expired (the clock passes `expires_ts`) | The digits dim to ink-3 and are struck from the accessibility tree | `printer.code.expired` |
| 500 `code-generation-failed` (`:166`) or `write-failed` (`:169`), or no connection | No code; secondary `action.try_again` | `printer.code.failed` |
| 503 `relay-not-provisioned` (`:168`) | No code; no retry button | `printer.code.not_ready` |
| 401 `unauthorized` (`:150`: neither an owner session nor a paired till) | No code; secondary `pin.pair_till` | `printer.code.unpaired` |

---

## 11. Destructive and account actions (one rule set)

| Tier | What | Trigger | Confirm | Haptic (§15) | After |
| --- | --- | --- | --- | --- | --- |
| A · reversible, local | Remove an **unsent** line; clear a filter; delete a draft note | Stepper from 1 to 0, `bill.remove`, or a full swipe | None | Adjust for a tap or stepper; Grab at the swipe threshold. One per gesture | Toast `bill.removed_toast` with Undo. Also undoable from bill › Recent changes |
| B · recorded | **Void** a sent line; Cancel sale; Refund; Cancel table; Clear a bill with sent lines; delete a customer; **replace the attendance code on every till** (§10.34) | Tonal danger control (never in the primary's row, ≥ 24 pt from it), an overflow menu item, or a full swipe | Confirm sheet (§10.3), with reason chips **when the act records a reason** (replacing the attendance code records none, so its sheet has none); manager approval (§10.2) if the merchant's policy requires it | Caution, the brief's "warning before": when the sheet opens from a tap, on its first frame; when it opens from a swipe, **at the swipe's 60 % threshold instead of Grab**, and the sheet then opens silently. A wrong manager code fires Failed. **Nothing after the confirm**, as the brief requires | The object changes state visibly; the server's answer drives it |
| C · account | Delete account, AI data settings, leave demo | Only in dashboard Settings › Account, behind the owner session and the owner's personal code | Confirm sheet, typed confirmation for deletion | Caution on open; nothing after | Never on the till, team app or KDS (`work-surface-actions-test`) |

**Reducing a sent line:** the stepper stops at the sent quantity, and any reduction is a Void (Tier B).

**Void sheet:**
- Title `void.title`; confirm `void.confirm` (danger solid); secondary `void.keep`.
- Reason chips: `void.reason.mind`, `void.reason.kitchen`, `void.reason.wrong`, `reason.other`.
- Consequences shown:
  - `void.kds`: the KDS strikes the line through with "Voided" (§18.7);
  - stock: the proposed rule is that unprepared lines return to stock (`void.stock_return`) and prepared lines are recorded as waste (`void.stock_waste`). That needs the stock module owner's confirmation (§23.6). **Until it is confirmed, or if the stock module answers differently, the sheet shows only `void.stock_generic`** ("Stock follows your stock settings."), which is true whatever the module does. The specific lines appear only for a rule the stock module reports.

**Cancel sale body copy:**
- Card: `cancel.card_body`.
- Cash: `cancel.cash_body` ("Give back 230.00 MAD in cash."). The drawer status line follows §10.26.

---

## 12. Information architecture (every brief surface, per device)

| Product | Phone | iPad | Desktop |
| --- | --- | --- | --- |
| **Dashboard** | Tabs: Home, Orders, Report, Customers, More. Nav bar: venue switcher, Kiwi AI, Notifications | Sidebar sections: **Today** (Home, Orders, Report) · **Sell** (Floor plan, Reservations, Menu and options, Menu analysis) · **Customers** (Customers, with Retention as a segment inside) · **Team** (Team, Planning) · **Money** (Terminals, Cash and Z, **Compliance**, **Invoicing**, **Accounting**, Stock and purchasing) · pinned Settings. Toolbar: Kiwi AI, Notifications | Same sidebar at 248; Cmd-K |
| More (phone) | The same sections as the sidebar, as a grouped list (so **More › Money › Compliance**), with Settings last | | |
| Compliance | A list of obligations (VAT declarations, Z archive, receipts retention, fiscal identifiers) with a status word and an icon per row, opening a detail screen; figures come from the ledger. Read-only on phone; exports on iPad and desktop | Split view: list 360 and detail | Same as iPad |
| Settings | Business (including the business-day cutoff and, revision 24, M2, the daily goal: `settings.goal`, with `settings.goal_unset` as its trailing value when none is set), Accountant access (revision 24: the read-only link for the store's accountant that `main` added in `954bbe18`, owner session only), Devices (pairing codes, printer; `settings.lift_pause` **only once `POST /api/pin/unlock` ships**, §23.8, and until then no row at all), Team codes, Appearance (theme), Language, Haptics, Notifications, **Account** (account actions, AI data, sign out) | Same | Same |
| Settings › Business: Delivery channels (`settings.channels`, revision 25, P11) | Delivery and accounting connectors. Shipped in the "Sécurité & Intégrations" card, for a real venue (`assets/interactive.js@31c94529:2234`); its `add-integration` action opens the connector drawer (`assets/dashboard-extra.js@31c94529:537`), which lists the connectors as available to connect. A demo venue sees the Glovo, Yassir and accounting toggles instead, and the native app hides Glovo and Yassir. **It moves to Business** because 2027 Settings has no Integrations group, and a delivery channel and an accounting export are about how the business sells and keeps its books; the security rows of that card are Team codes and Account | Same | Same |
| Export my data (shipped in "Sécurité & Intégrations", `assets/interactive.js@31c94529:2232`) | **Not shown in 2027** (revision 25, P11). Its sub-line promises sales, products and team as a CSV file, but its action `export-csv` has no export behind it: the only handler (`assets/pages-pro.js@31c94529:1487`, the same on `main`) shows "Export CSV généré · 22 lignes" and downloads nothing. A merchant gets the sales CSV from Report's export and the customers CSV from Customers (§12). The row returns when an export of the whole account produces a real file (§22) | Same | Same |
| Settings › Notifications: Morning briefing (`settings.morning`) | A per-device toggle, off by default, for a push at opening with yesterday's total (shipped in `assets/interactive.js` on `main` by `20f738c4`, `:2220` there; its handler `settings-morning`, `:2550`). It works only in the Kiwi Pro iOS app. In a browser the toggle says so and changes nothing. | Same | Same |
| Operator view | More › Operator (operators only) | Sidebar footer | Same |
| **Till** | Tabs: Floor, Takeaway, Waiting, Kitchen, More | Rail: Floor, Takeaway, Waiting, Kitchen, More; cashier slot | Same as iPad |
| Till More (sheet) | **Shift:** Cancel sale, Refund, Cash in or out, **Open the drawer** (revision 24, M1; manager approval), Shift change, **Team on shift** (revision 24, M1; live count, breaks and messages), **Sales this shift** (revision 24, M1), Attendance code (§10.34), **Stock** (revision 25, P9: every role, with its alert count, as shipped), Close the till · **Manage** (manager role): Menu, Customers and loyalty · **This device:** Printer and kitchen printing (printer code, §10.35), Language, Appearance, Haptics, **Fullscreen** (browser tills only; hidden in the native app), **Reload the till**, **Till ID** (paired tills only), **Sign out** (revision 24, M1). Every row is specified in §18.3 | Same | Same |
| Business-type tills | The same frame; the trade-specific part lives in the menu pane (planning grid, room board, pickup date) | Same | Same |
| **Team app** | Before sign-in: the sign-in screen (§18.10). After: tabs Tables, Menu, Alerts, Me. **Me** holds Clock in / Clock out (attendance code, §18.10), today's clocked time, a read-only break status with `clock.break_note` (breaks are managed by the till: `pause` and `resume` answer 403 `pause-managed-by-caisse`, `employee.js:480`), language, appearance, haptics and `team.sign_out` | Split view: Tables list (360) and table detail; the tabs become a sidebar | n/a |
| **KDS** | Single column with New / Preparing / Ready segmented | Lanes | Lanes. Header overflow (`kds.menu.*`): History, Stations, Display (Text size: Small, Medium, Large; theme), Sound, Input (Touch, Bump bar, Read-only wall) |
| **Guest ordering** | Menu › Item › Cart › Order placed; language globe in the header | Menu (2 columns) + cart pane 340 | Centred 1000 column |

**Where the shipped functions live (revisions 23 to 25).** The round 23 to 25 critiques found shipped functions that earlier revisions dropped without saying so: the assistant's, invoicing and export (revision 23), then the till's rail, Home's daily goal and recommendations, and the operational start card (revision 24), then the trades' questions, the online orders and the quick messages (revision 25). Each is placed here, and revision 25's inventory pass names every other shipped entry point (the table after the act table). Of the shipped functions, this direction removes only these, each listed in §22: Customize, the hero's chart toggle, the hero's margin sentence (its two figures stay), the Santé Kiwi tile, the till's narrow-screen rail toggle, and controls that only show a toast, Settings' Export my data among them; the two Orders drawer tabs below were removed on `main` in `cda95c04`, not by this direction. Lines are at `319ac100` for the dashboard and at `31c94529` for the till, unless a row names another commit.

| Shipped function | Where it ships | Where it lives in 2027 | Drawn in a hero |
| --- | --- | --- | --- |
| Dictation: the AI composer's mic, `/api/ai/voice`, the browser's recognition after a 429 or 503 | `assets/agent-voice.js` | Kiwi AI composer (§18.6) | Kiwi AI |
| Attach a photo or a PDF, read by `/api/ai/vision-inspect` | `assets/agent-vision.js` | Kiwi AI tools row, `ai.attach` (§18.6) | Kiwi AI |
| Calculator, with "Use this result" | `assets/agent.js:5190-5209` | Kiwi AI tools row, `ai.calculator` (§18.6) | Kiwi AI |
| Action Center: AI-proposed actions to confirm, reject or undo | `assets/agent-action-center.js` | Kiwi AI header, with the pending count (§18.6) | Kiwi AI |
| Simulate a hire, Test a price rise | `agent.js:1415-1426`, `:1502-1513` | Kiwi AI suggestions, `ai.suggest.hire` and `ai.suggest.price_rise` (§18.6) | Kiwi AI |
| My Kiwi features, Configure my business (the AI start cards for a store whose costs are not set up) | `agent.js:1444-1447`, `:1502-1503` | Kiwi AI suggestions, rows 4 and 5 for that store (§18.6) | No |
| Operational status card (an AI start card for a store whose costs are not set up, in place of the accounting card; its title, subtitle and question come from `operationalHero()`) | `agent.js:1465-1470`, `:1504`, `:1514` | Kiwi AI suggestions, row 6 for that store, `ai.suggest.ops.*` (§18.6) | No |
| My accounting (an AI start card) | `agent.js:1515`, `assets/accounting.js:950` | More › Money › Accounting (`ia.accounting`) | No |
| Read a supplier invoice (an AI start card, when supplier invoices are on) | `agent.js:1517` | Stock and purchasing's scan action (`stock-scan-invoice`); Kiwi AI still routes the question there (`agent.js:2583`) | No |
| The facts pane ("What I know"), wider than 920 | `agent.js:4914`, `:4948` | Kiwi AI's side column wider than 920, as shipped | No |
| Invoicing, the register of invoices | `assets/invoicing.js`; Home's "Invoicing" (`dashboard.html:5011-5014`) | More › Money › Invoicing (`ia.invoicing`) | No |
| The A4 sales invoice: one per sale, numbered F-AAAA-XXXX by the server, the seller's and buyer's legal data sealed | `assets/invoice.js:1-11`; Transactions rows (`pages-pro.js:20413-20440`, `:20755-20770`); the till's receipt step (`kiwi-caisse.html:7284-7286`, `:15937-15944`) | An order's detail in Orders, `invoice.a4` (§18.2), and the till's receipt choice (§10.26) | No |
| Day report (a Home quick action) | `assets/day-report-dash.js` | The Report tab (Today › Report) | No |
| Export: the printable report (a Home quick action) | `assets/dashboard-extra.js:1005-1023` | Report's nav bar, `report.export` (`download`): `export.printable` | No |
| Export: sales CSV (the Transactions drawer) | `dashboard-extra.js:1008-1014` | Report's export: `export.sales` | No |
| Export: the detailed day report, CSV | `day-report-dash.js:944`, `assets/day-report-export.js` | Report's export: `export.day_report` | No |
| Customers: Export (CSV), Loyalty program, Retention, Campaign | `assets/clients-directory.js:367-370` | Customers' overflow (§18.5) | The overflow icon |
| Orders' Réconciliation tab (the shipped Commandes drawer): a settlement card shown as one fixed day (`assets/pages-pro.js@319ac100:298`, `:358-360`) | Removed from `main` in `cda95c04` | **Removed on main in `cda95c04` (phase 1: no acquirer data).** Not homed | No |
| Orders' Anti-fraude tab (the shipped Commandes drawer): two fixed alerts whose buttons only show a notice (`pages-pro.js@319ac100:298`, `:376-396`, `:469-471`) | Removed from `main` in `cda95c04` | **Removed on main in `cda95c04` (phase 1: no acquirer data).** Not homed | No |
| Customize (Home's tiles, `customize-kpi`) | `dashboard.html:5007-5010` | Removed (§22) | No |
| Till rail: Salle, À emporter, Attente (modes) | `kiwi-caisse.html@31c94529:6029-6040` | Till tabs Floor, Takeaway, Waiting (§18.3) | Till |
| Till rail: Annuler une vente, Remboursement, Mouvement caisse, Passation caisse | `:6044-6059` | More › Shift: Cancel sale, Refund, Cash in or out, Shift change | No |
| Till rail: Ouvrir le tiroir (manager approval, `requireManager`; shown only when the store's `open-drawer` module is on) | `:6060-6063`, `openDrawerNoSale` `:17021-17045` | More › Shift › `till.more.open_drawer`, with `act.open_drawer`'s approval (§10.2) and the `drawer.*` lines (§18.3) | No |
| Till rail: the Transactions card (the sales journal: Résumé, Ventes par article, Journal) and the Ticket moyen and Tables réglées figures | `:6068-6081`, `:6965-6967`, `:16806-16807` | More › Shift › `till.more.sales`, a sheet with the three tabs; the figures head its Summary (§18.3) | No |
| Till rail: Code de pointage | `:6087-6090` | More › Shift › Attendance code (§10.34) | No |
| Till rail: Équipe, with the on-shift count: who is on shift, on break or off; start and end a break; message one person or the whole team | `:6092-6096`, `openTeamDrawer` `:17621-17625`, `manager-pause` and `manager-resume` `:17639-17657`, messages `:17724-17742` | More › Shift › `till.more.team`, its count as the trailing value, opening the team sheet (§18.3) | No |
| Till rail: Écran cuisine, with its count | `:6098-6102` | The Kitchen tab, with its badge (§18.3) | Till |
| Till rail: Impression cuisine, with its state | `:6104-6108` | More › This device › Printer and kitchen printing (§10.35) | No |
| Till rail: Stock, with its alert count | `:6113-6117` | More › Shift › `till.more.stock`, every role, with its alert count (revision 25, P9; §18.3) | No |
| Till rail: Mode nuit | `:6124-6128` | More › This device › Appearance | No |
| Till rail: Plein écran (browser tills) | `:6132-6136`, the toggle `:5950-5985` | More › This device › `till.more.fullscreen`, in a browser only; hidden in the native app (§18.3) | No |
| Till rail: Rafraîchir | `assets/caisse-refresh.js@31c94529:204-218` | More › This device › `till.more.reload` | No |
| Till rail: Fin de service | `:6137-6140` | More › Shift › Close the till (§18.9) | No |
| Till rail: Sortir (`/auth/logout`) | `:6143-6146` | More › This device › `settings.sign_out` (§18.3) | No |
| Till: the online-order inbox, the floating "Commandes" chip (`#kop-chip`) with its count, its overlay (`#kop-root`), the arrival sound and glow, and the card actions accept, pay, reject or cancel, ready, served or handed over, print and table (`data-kop-acc`, `data-kop-pay`, `data-kop-rej`, `data-kop-ready`, `data-kop-served`, `data-kop-print`, `data-kop-table`) | `assets/orderpro-inbox.js@31c94529:425-457`, `:653-834` | The Takeaway tab's online orders, with the rail badge and the arrival alert (§18.3, revision 25, M2); each action in the act table below | Till (the badge) |
| Till sidebar: the till's id, copied for support once paired | `:6022`, `:18711-18730` | More › This device › `till.more.device_id`, paired tills only | No |
| Home: the daily goal, "OBJECTIF JOUR" with its bar | `dashboard.html@319ac100:4931-4939`, `renderGoal` `assets/dateRange.js@319ac100:2679-2748` | Home's goal line under the key figure (§18.1, §18.11); the goal in Settings › Business; onboarding's goals step (§18.8) | Home |
| Home: "Kiwi Insights · Recommandations du jour", its chips and its input with the mic | `dashboard.html@319ac100:4963-4997`, `renderHeroAi` `dateRange.js@319ac100:2588-2655`, `assets/agent-voice.js@319ac100:270` | Kiwi AI's first card; the chips as its suggestion rows 1 to 3, **per trade as shipped** (revision 25, M1): the restaurant's `dash.hero.ai.chip1` to `.chip3`, and the `aiChips` lists of `getVocab('aiChips')` for a shop, a spa and a hotel (`assets/venues.js@319ac100:974`, `:997`, `:1020`), as `ai.suggest.restaurant`, `.boutique`, `.spa` and `.hotel`; the input as its composer and mic (§18.6) | Kiwi AI (restaurant and shop frames) |
| Kiwi AI's hero line (`fa-hero-insight`): "Café Atlas is solid, {m} % net margin, {s} % above your break-even point." (EN, `h.ins`) on a store whose costs are set up; on a real store without them (`B.partial`), the add-your-costs line | `assets/agent.js@319ac100:1490`, `:1500`, `:1520`; EN `:1428-1429`; real-store line `:994` | **The sentence goes; its two figures stay** (revision 25, P12). Net margin is Report's margin KPI, `kpi.margin`, with `kpi.margin_needs_costs` for a store without dish costs. The break-even distance is the answer to `ai.follow.breakeven`, the assistant's break-even intent (`agent.js@319ac100:1313`), offered as a follow-up chip (next row). The add-your-costs line is `ai.unknown_costs`. The sentence goes because it is a fixed verdict ("solid") above the conversation, and the sheet opens with one card, the Today card or the lever (§18.6) | No |
| Kiwi AI's follow-up chips: two under each answer, from the answer's `follow` list (`agent.js@319ac100:5075-5077`): break-even, profit forecast this month, break down my costs, invest 80,000 or 150,000 MAD, hire, a 5% price rise (`chips`, FR `:404-409`, EN `:576-581`, AR `:747-752`; for example `:1112`, `:1147`, `:1199`) | `agent.js` | Under each answer, the same chips (§10.7), up to two, as the answer names them: `ai.follow.breakeven`, `.forecast`, `.charges`, `.invest`, `ai.suggest.hire`, `ai.suggest.price_rise` (revision 25, P12; §18.6). A tap asks the question | No |

Report's export is one popover menu (§10.4) of the three exports, each for the range Report shows.

**Where each act starts (revision 24, M1).** Every `act.*` key of §9.6 names an act that a person starts somewhere; this table names the control, so an act cannot keep its approval, its offline row and its copy while losing its button. `strings-lint`'s act-reachability rule (§9.6) fails on a key without a row here. Revision 25 (M2) adds the online order's other actions, which take no approval and so have no `act.*` key, so the order's whole life has an entry.

| Act | Entry | Specified in |
| --- | --- | --- |
| `act.clear_order` | Bill header overflow (`action.more`) › `bill.clear`, while nothing is sent | §18.3, §10.23 |
| `act.cancel_order` | Bill header overflow › `bill.cancel_order`, on a takeaway order already sent | §18.3 |
| `act.cancel_table` | Bill header overflow › `bill.cancel_table` | §18.3 |
| `act.close_till` | More › Shift › `till.more.close` (revision 25, P10), then `count.close` | §18.9 |
| `act.cash_in`, `act.cash_out` | More › Shift › `till.more.cash_in_out` | §12 |
| `act.shift_change` | More › Shift › `till.more.shift_change` | §12 |
| `act.untrack_order` | Takeaway tab, a paid order's row › `takeaway.untrack` | §12 |
| `act.reject_online` | Takeaway tab › online orders: `takeaway.reject` on an order to accept, `online.cancel` on one in the kitchen or ready (revision 25, M2) | §18.3 |
| Accept an online order (revision 25, M2; no approval, so no `act.*` key) | Takeaway tab › online orders › `online.accept` | §18.3 |
| Mark an online order ready, served or handed over | Its card › `kds.mark_ready`, `kds.mark_served` (a table's), `online.hand_over` | §18.3 |
| Charge an online order | Its card › `bill.take_payment` | §18.3, §10.26 |
| Print an online order's kitchen ticket | Its card › `online.print` | §18.3 |
| Open an online order's table | Its card › `floor.table` | §18.3 |
| `act.open_drawer` | More › Shift › `till.more.open_drawer` | §18.3 |
| `act.discount.pct`, `act.discount.amount` | Bill footer › `bill.discount` | §10.31, §18.3 |
| `act.refund` | More › Shift › `till.more.refund` | §12 |
| `act.stock_adjust` | More › Shift › `till.more.stock`, a manual movement on a maison or boutique till (the restaurant till's Stock screen asks no approval, §10.2) | §12 |
| `act.cancel_sale` | More › Shift › `till.more.cancel_sale` (revision 25, P10), then `cancel.confirm` | §10.3 |

**Every shipped entry point (revision 25, the inventory pass).** At `f432a1de` the dashboard, the till, the team app and the shipped assets declare 703 distinct actions (each `data-action` value, and each `<button id>` in `kiwi-caisse.html` and `kiwi-serveur.html`). 102 are buttons inside a dialog (cancel, confirm, close, back, next, done), which follow the dialog they close. The rest of this spec named 22 by code. Before this pass, the other 579 had no row that named them, though many had a home under their visible label. This pass names each one, with its home, its removal or the stage that reskins it. The hero surfaces get one row per entry point or tight group. A module this direction only reskins gets one row: every action in it carries over unchanged, restyled with the kit at the stage named. A module outside this direction's scope gets one row saying so. Line numbers are at `f432a1de`.

| Shipped entry point | Where it ships | Where it lives in 2027 | Drawn in a hero |
| --- | --- | --- | --- |
| The venue switcher and its list: one venue, all venues together (`venue-toggle`, `venue-pick`, `venue-enter-fusion`, `venue-exit-fusion`), and an operator's scope (`venue-scope`) | `dashboard.html:4685`; `assets/venues.js:1960-2013` | Home's nav bar venue switcher (§18.1); the list sheet carries each venue, the all-venues entry and, for operators, the scope | Home |
| Kiwi AI (`open-assistant`) | `dashboard.html:4847` | The nav bar's Kiwi AI capsule, `nav.ai` (§18.1) | Home |
| Compare (`rev-compare`) | `dashboard.html:4955`, `onCompareToggle` `dateRange.js:6142` | Home's compare control (§18.1) | Home |
| A custom date range (`open-date-picker`) | `dashboard.html:4882`, `openCustomPicker` `dateRange.js:6141` | Report's range control, which keeps the shipped date-pair picker, restyled at stage 5; Home keeps its four presets (§18.1) | No |
| The hero's chart or today view toggle (`hero-toggle-chart`) | `dashboard.html:4900`, `dateRange.js:6144-6159` | Removed (§22): Home always draws the chart (§18.1) | No |
| The live feed's Filter and See all (`filter-tx`, `feed-view-all`); a feed row's detail on the phone (`tx-detail`) | `dashboard.html:5072-5073`; `assets/mobile-nav.js:313` | Home's Latest orders and its See all, which opens Orders with its filters; a row opens the order's detail (§18.1, §18.2) | Home, Orders |
| "Configure the Glovo combo" (`hh-ai-glovo`) and "Enable auto prompt" (`tip-prompt`) | `dashboard.html:5058`, `:5319`; handlers `dateRange.js:6160-6163`, `dashboard-extra.js:1039-1042` | Removed (§22): each only shows a toast | No |
| The "Santé Kiwi" tile and its link (`merchant-health-open`, `merchant-health-go`) | `assets/merchant-health.js:350-356` | Removed (§22): Home has no "For you" row (§18.1); what the tile says, which Kiwi features are on and what to turn on next, is Kiwi AI's row "Which Kiwi features do I have?" (§18.6) | No |
| Reservations (`nav-reservations`); the spa's journey builder (`resv-builder`) | `dashboard.html:5147`; `assets/pages.js:1950` | Sell › Reservations | No |
| Stock: Reorder (`stock-reorder`, `openQuickOrder` `stock.js:8045`), Suppliers (`view-suppliers`), the stock alert's link (`nav-stock`), a new purchase order and its detail (`supplier-new-po`, `supplier-po-detail`) | `dashboard.html:5208`, `:5213`; `dateRange.js:5450`; `dashboard-extra.js:159`, `:182` | Money › Stock and purchasing | No |
| Margins and Manage menu (`view-margins`, `menu-edit`, `nav-menu`); the margins export (`margin-export`) | `dashboard.html:5296-5297`; `assets/finance.js:845`; `dashboard-extra.js:363` | Sell › Menu analysis, with its export; Sell › Menu and options | No |
| Team settings (`team-settings`); a manual clock entry (`manual-clock`) | `dashboard.html:5330`; `pages.js:2147` | Team › Team; Team › Planning | No |
| Retention (`customer-retention`); the CRM page (`growth-crm`) | `dashboard.html:4726`; `assets/clients-directory.js:385` | Customers, with Retention as a segment inside (§12's sidebar; the Customers overflow, §18.5) | Customers (overflow) |
| Charges (`charges-open`) | `assets/charges.js:498` | Money › Accounting, where the costs Kiwi AI's simulators need are entered (§18.6) | No |
| Cash and Z: the day's sales from a Z (`z-view-sales`) | `assets/z-reconciliation.js:252` | Money › Cash and Z | No |
| Delivery and accounting connectors (`integration-configure`, `integration-connect`) | `dashboard-extra.js:598`; `assets/channel-link.js:786` | Settings › Business › Delivery channels (`settings.channels`, above) | No |
| Account and business: My profile (`account-profile`), the profile, password and business forms (`account-edit-profile`, `account-change-pw`, `account-edit-business`, `account-add-business`), plan and billing (`account-billing`, `account-plan-downgrade`, `upgrade-pro`, `upgrade-plan`, `manage-billing`), opening hours (`settings-hours`), theme (`toggle-theme`), Help centre and WhatsApp support (`account-help`, `help-whatsapp`), the onboarding entry (`onboard`) | `dashboard.html:4780`, `:4810`, `:4835`, `:5479`; `assets/account.js:695-759`; `assets/interactive.js:3559`; `venues.js:1886`, `:1975`; `dashboard-extra.js:1043` | Settings: Account (profile, password, plan and billing, Help), Business (business details, a second business, opening hours), Appearance; the onboarding flow (§18.8), stage 5 for Settings and stage 6 for onboarding | No |
| The Ultra band's three demo calls to action (`fs-ultra-transfer`, `fs-ultra-call`, `fs-ultra-api`) | `venues.js:3265-3288`, handlers `:2632-2643` | Removed (§22): each shows a toast over fixed demo data | No |
| The till's opening: Open the till (`clockin-btn`) and the last float as a one-tap shortcut, never preselected (`ci-float-last`) | `kiwi-caisse.html:5881-5886` | The opening count, `count.open`, with `count.same_as_last` (§18.9) | No |
| The till's rail functions not named above: Cancel a sale (`cancel-sale`), Cash in or out (`cash-move`), Shift change (`passation`) and its slip (`ho-slip-print`), the sales journal card (`stat-txns-card`), the till ID (`caisse-terminal-id`), Attendance code and a new code (`open-attendance-code`, `attendance-code-new`), Team, a message and the whole team's (`open-team`, `msg-send`, `team-broadcast-all`), kitchen printing (`open-kitchen-print`, `printer-connect`), night mode (`theme-toggle`), End of service (`fin-service`), the narrow-screen rail toggle (`toggle-nav`) | `kiwi-caisse.html:712`, `:6058-6180`, `:6983`, `:7244`, `:7269`, `:18029` | More › Shift: `till.more.cancel_sale`, `till.more.cash_in_out`, `till.more.shift_change` (its done step keeps Print the slip), `till.more.sales`, Attendance code (§10.34), Team on shift with `till.team.message` and `.message_all`, `till.more.close`; More › This device: Printer and kitchen printing (§10.35), Appearance, `till.more.device_id`. The rail toggle goes: the phone has tabs and the iPad a rail that is always shown (§18.3) | Till (the rail) |
| The kitchen screen in the till (`open-kds`, `kds-close-btn`) and its history (`kit-history-toggle`) | `kiwi-caisse.html:6150`, `:7301`, `:7309` | The Kitchen tab (§18.3); History in the header overflow, `kds.menu.history` (§12, KDS) | Till |
| The till's Stock screen: declare a waste and confirm it, receive stock, a blind count (`sk-new-waste-btn`, `sk-commit-waste-btn`, `sk-recept-btn`, `sk-apercu-recept-btn`, `sk-start-blind-count`, `stock-close-btn`) | `kiwi-caisse.html:7330-7332`, `:20358`, `:20535`, `:20910` | More › Shift › `till.more.stock`; its screens carry over unchanged, restyled at stage 4 | No |
| The bill: the phone's bill handle and the full view (`rp-peek`, `toggle-ticket`, `rp-expand-btn`); Send to kitchen (`rp-send-kitchen`, `validate-order`, `or-btn-kitchen`); Add items (`rp-add-items`); Move and Merge (`rp-transfer-table`, `rp-merge-table`); cancel a new order (`cancel-new-order`) | `kiwi-caisse.html:6360-6486`, `:6550` | The bill pane, and on the phone the bill bar that opens it (§18.3): `bill.send`; the menu pane adds items; the header overflow's `bill.transfer`, `bill.merge`, `bill.clear` and `bill.cancel_order` | Till |
| Payment: cash, card, charge the table or the order (`pay-charge`, `pay-card`, `pay-charge-order`, `or-btn-pay`); Split, start, resume or cancel it (`pay-split`, `split-launch`, `resume-split`, `cancel-split`); the receipt's Print and A4 invoice (`receipt-print`, `receipt-invoice`) | `kiwi-caisse.html:6409-6478`, `:6553`, `:6727`, `:7284-7287` | `bill.take_payment` and the method choice (§10.26); `bill.split` and the split sheet (§10.30); `receipt.print` and `invoice.a4` (§18.3) | Till |
| Reprint the bill (`reprint-bill`); Customer and loyalty on the bill (`rp-client`); remove a discount (`rm-remove`, `remove-table-discount`, `remove-vrap-discount`) | `kiwi-caisse.html:6428`, `:6497`, `:7128`, `:8952`, `:10482` | Carried over unchanged at stage 4: the first two in the bill header overflow, the removal in the discount sheet (§10.31). This direction gives none of them a key; that is left open (§23, note under the table) | No |
| Takeaway: a new order and back to the list (`vrap-new-order`, `vrap-back-board`); Enter amount and Add to the bill (`mlibre-toggle`, `mlibre-add`); add to the waiting list (`wl-add-btn`) | `kiwi-caisse.html:6304-6349` | The Takeaway tab's New order; `menu.enter_amount`; the Waiting tab's Add, carried over at stage 4 (§18.3) | Till |
| Closing: print or reprint the Z, continue without printing, continue the service (`clo-print`, `clo-continue`, `zs-print`, `zs-reprint`, `zs-skip`) | `kiwi-caisse.html:6912-6944` | Close the till and its Z step (§18.9): `z.print`; reprint, continue without printing and continue the service carried over unchanged at stage 4 | No |
| Team app: sign in (`employee-login-submit`); clock in, from the start screen or off shift (`ci-button`, `offshift-clockin`), or browse without clocking in (`ci-browse-link`); clock out and the end-of-shift card's Share (`profil-clockout`, `kg-sc-clockout`, `kg-sc-share`); sign out (`offshift-logout`); the week, the month and the hours history (`kg-month-open`, `kg-month-prev`, `kg-hours-open`, `hours-history-prev`) | `kiwi-serveur.html:4241-4970` | The sign-in screen (§18.10); Me: Clock in and Clock out (§18.10), the browse link beside Clock in, today's clocked time with its history and the month, `team.sign_out` (§12, Team app), stage 6 | No |
| Team app, a table: Send the order (`lancer`), the bill (`ask-bill`), Move and Merge (`transfer-table`, `merge-table`), Customer and loyalty or a walk-in customer (`pc-client`, `service-client-none`) | `kiwi-serveur.html:4751`, `:4779`, `:8644-8705` | Tables › the table's detail, its actions carried over at stage 6 | No |

| Module this direction reskins | Its entry points, every one carried over unchanged | 2027 home | Stage |
| --- | --- | --- | --- |
| `assets/pages-pro.js`: the sidebar's drawers, among them Transactions, Terminals, Settlements, Team, Tables, Menu, KDS, Stock, Payroll, Reservations, appointments, the spa's services and practitioners, and the boutique catalogue | `add-iban`, `add-member`, `add-reservation`, `add-terminal`, `ai-pointage`, `all-leaves`, `appt-auto-toggle`, `appt-confirm-final`, `appt-detail`, `appt-export`, `appt-filter`, `appt-new`, `appt-reschedule`, `appt-wait-add`, `appt-wait-detail`, `appt-wait-promote`, `audit-export`, `bqx-cat-color`, `bqx-cat-del`, `bqx-cat-new`, `bqx-cat-new-save`, `bqx-cat-rename`, `bqx-cat-rename-save`, `bqx-cfilter`, `bqx-export`, `bqx-filter`, `bqx-import`, `bqx-low`, `bqx-new`, `bqx-new-save`, `bqx-open`, `bqx-print-go`, `bqx-prod-del`, `bqx-prod-edit`, `bqx-prod-edit-save`, `bqx-prod-movements`, `bqx-prod-print`, `bqx-sel-all`, `bqx-sel-archive`, `bqx-sel-del`, `bqx-sel-mode`, `bqx-sel-move`, `bqx-sel-restore`, `bqx-sel-toggle`, `bqx-templates`, `bqx-var-add`, `bqx-var-add-save`, `bqx-var-color`, `bqx-var-color-save`, `bqx-var-dec`, `bqx-var-del`, `bqx-var-gen`, `bqx-var-gen-all`, `bqx-var-inc`, `bqx-var-print`, `bqx-var-reg`, `bqx-var-reg-save`, `bqx-view`, `broadcast-team`, `cal-export`, `catalog-order`, `contact-sales`, `credit-adjust`, `dismiss-drawer`, `dismiss-modal`, `distribute-tips`, `download-kit`, `edit-perms`, `edit-shifts`, `edit-tip-rule`, `eq-regen-pin`, `eq-send-broadcast`, `eq-submit-member`, `export-comptable`, `export-dgi`, `export-payroll`, `export-pdf`, `generate-payslips`, `iban-detail`, `kds-86`, `kds-bump`, `kds-fullscreen`, `kds-print-summary`, `kds-reassign`, `kds-recall`, `kyc-replace`, `leave-approve`, `leave-deny`, `member-detail`, `member-reset-pin`, `menu-add`, `menu-cat-add`, `menu-cat-edit`, `menu-mass`, `menu-opt-add`, `menu-promote`, `menu-publish`, `menu-schedule`, `menu-station-create`, `mz-clear-product`, `mz-export`, `mz-new`, `nav-stock-movements`, `nav-transactions`, `new-sale`, `payslip-pdf`, `pkg-edit-go`, `prac-add`, `prac-agenda`, `prac-commission`, `prac-edit`, `prac-remove`, `prac-tracker`, `promo-archive-detail`, `promo-edit`, `promo-schedule`, `promo-segment`, `resv-buffer`, `resv-detail`, `resv-sms`, `ret-approve`, `ret-block`, `ret-detail`, `ret-exchange`, `ret-export`, `ret-policy-jump`, `ret-policy-save`, `ret-refund-credit`, `ret-refund-original`, `ret-refund-whatsapp`, `ret-refuse`, `rotate-secret`, `sale-invoice-pdf`, `sale-invoice-print`, `sales-kind`, `sales-method`, `settle-now`, `spa-cli-add`, `spa-cli-bday`, `spa-cli-bday-batch`, `spa-cli-bday-batch-send`, `spa-cli-bday-send`, `spa-cli-block`, `spa-cli-book`, `spa-cli-filter`, `spa-cli-gift`, `spa-cli-note`, `spa-cli-search`, `spa-cli-wa`, `spa-cli-wa-send`, `starter-add`, `sv-delete`, `sv-save`, `svc-ai-action`, `svc-cure-edit`, `svc-edit`, `svc-export`, `svc-new`, `svc-pkg-edit`, `svc-season`, `svc-season-edit`, `term-add`, `term-manage`, `term-test`, `tx-daterange`, `tx-filter`, `tx-show-all`, `upload-kyc` | The sidebar section that names each drawer (§12) | 5, one drawer at a time |
| `assets/hotel.js`: the hotel pages (reception, room plan, stays, housekeeping, rates, folios, channels) | `hx-account-edit`, `hx-account-new`, `hx-account-stays`, `hx-add-charge`, `hx-add-group-traveler`, `hx-add-guest-row`, `hx-apply-ai`, `hx-bulk-resume`, `hx-bulk-review`, `hx-cancel-import`, `hx-cb-connect`, `hx-cb-rate-step`, `hx-channel-delete`, `hx-channel-guide`, `hx-channel-save`, `hx-channel-status`, `hx-channel-sync`, `hx-char-add`, `hx-char-remove`, `hx-checkin`, `hx-checkout`, `hx-checkout-pay`, `hx-commercial`, `hx-commercial-refresh`, `hx-configure-rate`, `hx-confirm-import`, `hx-contract-edit`, `hx-contract-new`, `hx-daily-apply`, `hx-daily-refresh`, `hx-demo-folio`, `hx-direct-push`, `hx-discard-staged`, `hx-dispo`, `hx-dispo-prev`, `hx-dispo-refresh`, `hx-dispo-today`, `hx-dossier`, `hx-econ-add-terminal`, `hx-econ-add-unit`, `hx-econ-refresh`, `hx-econ-remove-terminal`, `hx-econ-save`, `hx-econ-shift`, `hx-filter-modal-apply`, `hx-filter-modal-reset`, `hx-filter-remove`, `hx-floor-delete`, `hx-floor-edit`, `hx-floor-move`, `hx-floor-new`, `hx-floor-save`, `hx-floors`, `hx-folio`, `hx-group-new`, `hx-group-resume`, `hx-guest`, `hx-guest-direct`, `hx-guest-msg`, `hx-hk-assign`, `hx-hk-assign-to`, `hx-hk-open`, `hx-hs-fix`, `hx-monthly-closing`, `hx-noshow-secure`, `hx-outlet-edit-menu`, `hx-outlet-menu`, `hx-post-charge`, `hx-preview-paste`, `hx-production`, `hx-rate-cell`, `hx-rate-save`, `hx-rate-step`, `hx-remove-group-traveler`, `hx-remove-guest-row`, `hx-room`, `hx-room-add`, `hx-room-add-floor`, `hx-room-batch-save`, `hx-room-bulk-edit-open`, `hx-room-check`, `hx-room-delete`, `hx-room-delete-open`, `hx-room-edit`, `hx-room-filter-reset`, `hx-room-filters-open`, `hx-room-floor`, `hx-room-save`, `hx-room-search`, `hx-room-select-filtered`, `hx-room-select-none`, `hx-room-select-toggle`, `hx-room-status`, `hx-room-type-delete`, `hx-room-type-edit`, `hx-room-type-new`, `hx-room-type-save`, `hx-room-types`, `hx-simulate-group-quote`, `hx-stay`, `hx-stay-checkin`, `hx-stay-checkout`, `hx-stay-edit`, `hx-stay-new`, `hx-stay-noshow`, `hx-stay-reopen`, `hx-stay-undo-checkin`, `hx-tape-prev`, `hx-tape-today`, `hx-taxe-export`, `hx-type-photo-move`, `hx-type-photo-pick`, `hx-type-photo-remove`, `hx-view-add`, `hx-view-remove`, `hx-views-manage-open`, `hx-walkin`, `hx-walkin-room`, `nav-chambres`, `nav-economat`, `nav-equipe`, `nav-menage`, `nav-reception`, `nav-tarifs` | The hotel's sidebar sections, as `VERTICAL_SECTIONS.hotel` in `venues.js` lists them | 5 |
| `assets/hotel-economat.js`: the hotel's stores | `eco-receive`, `eco-receive-save`, `eco-sync`, `nav-points-vente` | Money › Stock and purchasing, on a hotel | 5 |
| `assets/stock.js`: Stock and purchasing | `stock-add-cat`, `stock-add-item`, `stock-add-supplier`, `stock-call-supplier`, `stock-cancel-waste`, `stock-cat-filter`, `stock-count-detail`, `stock-count-range`, `stock-count-status`, `stock-count-tab`, `stock-day-detail`, `stock-declare-waste-prefill`, `stock-delete-item`, `stock-delete-supplier`, `stock-edit-item`, `stock-edit-suggested`, `stock-edit-supplier`, `stock-export-counts-csv`, `stock-export-waste-csv`, `stock-ignore-24h`, `stock-item-detail`, `stock-manage-cat`, `stock-mark-86`, `stock-new-order`, `stock-new-po`, `stock-open-declare-waste`, `stock-physical-count`, `stock-program-shortfall`, `stock-send-suggested`, `stock-sort`, `stock-status-filter`, `stock-subview`, `stock-supplier-detail`, `stock-tab`, `stock-upgrade-ultra`, `stock-urgent-order`, `stock-venue-filter`, `stock-view`, `stock-wa-supplier`, `stock-waste-range`, `stock-waste-reason`, `stock-workspace-actions` | Money › Stock and purchasing | 5 |
| `assets/team.js`: Team and Planning | `kt-add-member`, `kt-confirm-delete`, `kt-delete-member`, `kt-edit-member`, `kt-employee-app`, `kt-export-csv`, `kt-filter-contract`, `kt-filter-dept`, `kt-import-csv`, `kt-import-csv-apply`, `kt-lang-toggle`, `kt-paytab`, `kt-period`, `kt-period-nav`, `kt-plan-apply`, `kt-plan-clear`, `kt-plan-coverage`, `kt-plan-coverage-delete`, `kt-plan-coverage-save`, `kt-plan-fair`, `kt-plan-fair-build`, `kt-plan-hours`, `kt-plan-open`, `kt-plan-open-save`, `kt-plan-optimize`, `kt-plan-publish`, `kt-plan-request-decision`, `kt-plan-requests`, `kt-plan-template-apply`, `kt-plan-template-save`, `kt-plan-week`, `kt-pwd-copy`, `kt-pwd-gen`, `kt-qe-save`, `kt-quick-entry`, `kt-shift-edit`, `kt-submit-member`, `kt-tab`, `kt-view-profile` | Team › Team; Team › Planning | 5 |
| `assets/restaurant-menu-workspace.js` and `assets/menu-catalog.js`: the menu and its options | `rmw-cat-add`, `rmw-cat-filter`, `rmw-classify`, `rmw-group-add`, `rmw-group-delete`, `rmw-group-edit`, `rmw-hours-period`, `rmw-i18n-add`, `rmw-i18n-fill`, `rmw-i18n-redo`, `rmw-i18n-remove`, `rmw-i18n-toggle`, `rmw-item-add`, `rmw-menu-scan`, `rmw-nutrition-filter`, `rmw-nutrition-hide`, `rmw-reactivate`, `rmw-recipe-edit`, `rmw-sales-period`, `rmw-section-actions`, `rmw-station-add`, `rmw-station-delete`, `rmw-station-edit`, `rmw-sub-add`, `rmw-sub-delete`, `rmw-sub-filter`, `rmw-sub-rename`, `rmw-tab`, `rmw-tab-pick`, `mx-cat-add`, `mx-cat-del`, `mx-cat-edit`, `mx-cat-pick`, `mx-import`, `mx-item-add`, `mx-item-avail`, `mx-item-del`, `mx-item-edit`, `mx-load-example`, `mx-opts`, `mx-stations`, `mx-stations-manage`, `mx-sub-add`, `mx-sub-pick`, `orderpro-tags` | Sell › Menu and options | 5 |
| `assets/conformite.js`: Compliance's tabs (Z history, hygiene, equipment, documents) | `cf-doc-detail`, `cf-doc-filter`, `cf-doc-upload`, `cf-eq-add`, `cf-eq-detail`, `cf-hyg-export`, `cf-hyg-toggle`, `cf-tab`, `cf-z-history` | More › Money › Compliance; each shipped tab is a row of its list, opening its screen (§12) | 5 |
| `assets/boutique-promos-dashboard.js`: a shop's promotions | `bpd-delete`, `bpd-edit`, `bpd-filter`, `bpd-new`, `bpd-print`, `bpd-starter`, `bpd-toggle` | Sell › Menu and options, on a shop | 5 |
| `assets/operations-ui.js`: the operations history | `operations-history` | The drawer it is attached to | 5 |
| `assets/depenses.js`: Expenses and cards, a Kiwi Pay surface | `dep-approve`, `dep-freeze`, `dep-new-card`, `dep-pay`, `dep-refuse`, `dep-site` | **Out of scope:** Kiwi Pay is phase 2, and this direction neither redraws nor homes it; it ships as it is | none |

---

## 13. Layout per device class

### 13.1 Size classes
- A 6-line head script sets `html[data-k-width]` from `matchMedia` listeners, with no layout read.
- Layouts pass `size="compact|regular"` to kit hosts whose width they know (the bill pane is regular at every width in §13.3; the rail is always compact).
- ResizeObserver is used only for free-floating hosts.
- No container queries (§4).

### 13.2 Phone (375 to 440)
- One column; the floating tab capsule; the primary in the bottom 40 %.
- **Till:**
  - menu grid 2 columns;
  - the bill bar (§10.32) above the capsule, opening the bill sheet at the large detent;
  - Floor stays as shipped (§18.4).
- **KDS:** one column with New / Preparing / Ready segmented.
- **Planning grids** (spa, coiffure): one staff member per page, with a segmented switch.

### 13.3 Till width rule (one rule for every tablet and desktop width)

| Viewport width | Navigation | Menu pane | Bill pane | Examples |
| --- | --- | --- | --- | --- |
| < 600 | Tab capsule | Full width, 2 columns | Sheet via the bill bar | Every iPhone |
| 600 to 767 | Tab capsule floating over the menu pane only | Remaining width | **320** | iPad mini portrait (744): menu 424, 2 columns |
| 768 to 999 | Rail 88 | Remaining width | **320** | iPad 11 portrait (834): menu 426, 2 columns |
| 1000 to 1179 | Rail 88 | Remaining width | **360** | iPad 13 portrait (1032): menu 584, 3 columns; iPad mini landscape (1133): menu 685, 3 columns |
| ≥ 1180 | Rail 88 | Remaining width | **432** | iPad 11 landscape (1210): menu 690, 3 columns; iPad 13 landscape (1376): menu 856, 4 columns |

- **Menu columns** = as many 168-wide minimum columns as fit after 24 margins and 16 gaps, at most 4: `min(4, floor((pane − 48 + 16) / (168 + 16)))`.
- Payment, split, discount and options happen in the bill pane or a popover, never in a shrunken phone sheet.
- **Height rule for payment (revision 7, M3):** H ≥ 1018 draws the regular payment stack in the bill pane; 578 ≤ H < 1018 draws the compact form, with the summary over the menu pane and the keypad in the bill pane; 514 ≤ H < 578 steps the keys down to 56; below 514 the page scrolls as a whole (§18.3, per-device table there). Landscape iPad 11, iPad 10th and 11th, iPad Air 11 and iPad mini are compact; every portrait iPad and the 13-inch landscape iPads are regular. Nothing inside the keypad column scrolls in any form.

### 13.4 iPad portrait (dashboard, team app, guest ordering)
- **Dashboard:** overlay sidebar; hero and chart, then KPI 2 × 2. An odd count makes the last tile full width.
- **Team app:** split view.
- **Guest ordering:** menu plus a cart pane.

### 13.5 iPad landscape and desktop
- **Dashboard:** sidebar 280 (iPad) or 248 (desktop); hero and chart across 8 columns, KPIs in 4. On wide screens the KPIs become a row of 4.
- **Desktop:** keyboard everywhere; fine-pointer rows 44.

### 13.6 Kitchen (KDS)
- **Root font size:** 24 px (size M; S 20, M 24, L 28), set on `html[data-k-surface="kds"]` only. The six steps are the same rem values as everywhere else (§6.2), so the kitchen uses at most six sizes, and an embedded kitchen board inside the till keeps the till's 16 px root.
- **Targets:** 56; ticket actions 64.
- **Input modes** (Settings › Input):

| Mode | Hardware | Actions |
| --- | --- | --- |
| Touch | iPad or touch monitor | Footers show the item action (K 64) |
| Bump bar | USB keypad or keyboard on a TV | Footers hidden. Each ticket shows a position badge "1" to "9" (Heading in a 40 circle). Keys: digit selects; `Enter` advances the selected ticket; `0` opens History; `−` recalls the last bumped; arrows move the selection, shown by a 3 px accent frame |
| Read-only wall | Non-touch TV | No actions; a paired iPad at the pass bumps |

- **Overflow (the wall never scrolls)**, one deterministic pass per lane:
  1. Tickets are placed oldest first: top to bottom, then the next column (right to left in AR).
  2. A ticket that does not fit at full height in the space left is placed **compressed**: header, one `kds.compressed` line ("2 items"), action.
  3. A ticket that does not fit even compressed starts the **newer card** (`kds.newer`, "+1 newer", 88 tall, a Body line in a K-height card), which holds it and every newer ticket and opens a sheet (`kds.newer_open`). If the newer card itself does not fit, the ticket before it is compressed to make room.
  4. The oldest ticket is always full.
  Heights at the M root (24 px) are derived in §18.7.
- **Visual angle** on a 24-inch 1080p screen (3.61 px/mm) at 2 m:

| Element | Size | Cap height | Visual angle |
| --- | --- | --- | --- |
| Ticket number (Display, 2.75 × 24) | 66 px | 48 px, 13.3 mm | 22.9 arcmin |
| Timer (Title, 1.75 × 24) | 42 px | 8.5 mm | 14.5 arcmin (state is also carried by fill, icon and word) |
| Items (Body, 1.0625 × 24) | 25.5 px | 5.1 mm | 17.6 arcmin at 1 m (read at the pass) |

  On a 13-inch iPad (5.2 CSS px/mm), the ticket number subtends 15.9 arcmin at 2 m. Guidance: an iPad is a pass screen, read at up to 1.5 m; a 2 m wall needs a 24-inch screen.

---

## 14. Motion

### 14.1 Duration tokens (no other values)

| Token | ms | Uses |
| --- | --- | --- |
| `--k-dur-1` | 90 | Press-in |
| `--k-dur-2` | 160 | Fades, colour, reduced-motion crossfade, toast out, popover out, label crossfade |
| `--k-dur-3` | 240 | FLIP list moves, toast in, popover in, sheet dismiss; the store lock's entrance (§14.4, revision 15, P12); also the chart scrub hold (§14.7) |
| `--k-lens-stretch` | 115 | The lens's stretch phase: the hold before the settle starts (§14.3). Not a transition duration on its own |
| `--k-dur-4` | 310 | Lens settle (and the transition the stretch phase rides on), switch knob, badge pop, press release |
| `--k-dur-5` | 350 | Push and pop, sheet present, pane takeover |
| `--k-dur-6` | 400 | Number roll, PIN shake |
| `--k-dur-7` | 600 | Inserted-line highlight fade, PIN error hold, recalled-ticket frame, success name hold |
| `--k-dur-8` | 1100 | Paid moment hold (the shipped value) |
| `--k-dur-9` | 1200 | Skeleton and verifying pulse loop, spinner revolution |
| `--k-dur-toast` | 4000 | Info toast |
| `--k-dur-toast-action` | 8000 | Toast with action (pauses as in §10.17) |

### 14.2 Curves
- `--k-spring` `cubic-bezier(0.34, 1.45, 0.5, 1)`: selection and release only (lens, knob, badge, press release).
- `--k-glide` `cubic-bezier(0.32, 0.72, 0, 1)`: duration-based movement.
- `--k-exit` `cubic-bezier(0.4, 0, 1, 1)`: leaving.

The feel layer's `cubic-bezier(.2,.8,.2,1)`, `--expo` and the lens's `top .15s ease` / `height .15s ease` are retired (§20.3, §20.5).

### 14.3 Interruptible movement

**Gesture spring** (`assets/kit/motion.js`), for sheet drag release, row swipe release, pull to refresh and KDS drag (none today). **The lens is not on it** (see below).
- Semi-implicit Euler at a fixed 1/120 s step.
- **Stiffness 1400, damping 74.8, mass 1** (damping ratio 1.0, critically damped, no overshoot).
- Rest when |x| < 0.5 pt and |v| < 5 pt/s.
- It writes `transform` only.
- **A retarget keeps the current position and velocity.**
- **Computed settle times** (simulated with exactly these rules; the script is in the evidence pack):

| Travel | Release velocity toward the target | Settles in |
| --- | --- | --- |
| 200 pt | 0, 800 or 2,000 pt/s | 300 to 308 ms |
| 400 pt | 0, 800 or 2,000 pt/s | 333 ms |
| 880 pt (a full-height sheet on a 956-tall phone) | 0, 800 or 2,000 pt/s | 367 ms |

  The target is ≤ `--k-dur-5` (350 ms) for travel up to 400 pt, which these constants meet. The full-height case is 17 ms over and is stated, not hidden. For comparison, revision 2's k 420 / c 40 settles a 400 pt sheet in 500 to 508 ms under the same rules (the critic's figure, reproduced), which is why it was replaced.
- **Duration-based motion** (fades, pushes, the lens) uses WAAPI. A new target starts from the current presented value.
  - When a gesture grabs a WAAPI animation mid-flight (catching a presenting sheet), the solver takes over with velocity = the glide curve's derivative at the current progress × distance / duration.

**The lens has one character, in two named phases**, exactly as shipped (`assets/liquid-lens.js:154-160`):
1. **Stretch.** At t = 0 the lens's target becomes the span of the old and the new option, and it starts toward it on `--k-spring` over `--k-dur-4`.
2. **Settle.** At t = `--k-lens-stretch` (115 ms) the target becomes the new option alone, and the lens retargets from wherever it is, again on `--k-spring` over `--k-dur-4` (310 ms).
- **A tap therefore takes 115 + 310 = 425 ms** from the tap to rest. Revision 4's "310 ms for every move" described only the settle and is withdrawn.
- Reduced motion: no stretch; the lens crossfades to the new option over `--k-dur-2` (§14.5).
- A drag across a segmented control: the lens tracks the finger 1:1 with no animation, and on release animates from where it is to the nearest option with the same curve and duration. It never uses the solver, so it never settles a second way.

### 14.4 What moves, and how

| Change | Recipe |
| --- | --- |
| Push / pop | Incoming `translateX(100% to 0)` over `--k-dur-5` glide. Outgoing `translateX(0 to −25%)` under a `--k-scrim-push` overlay fading in. Mirrored in RTL. Edge swipe is interactive (solver) |
| Tab or sidebar switch | Content swaps instantly; only the lens moves |
| Segmented change | The lens stretches to span old and new for `--k-lens-stretch` (115), then settles over `--k-dur-4` (310): 425 ms in all (§14.3). Content crossfades over `--k-dur-2` |
| Sheet | Presents over `--k-dur-5` glide with the scrim; dismisses over `--k-dur-3` exit, or on the solver |
| Popover | `scale(0.96 to 1)` with opacity, `--k-dur-3`, origin at the anchor |
| Bill line insert (FLIP) | The new row is laid out at full height in one frame. The rows below are shifted by `translateY(−h)`, then animate to 0 over `--k-dur-3` glide. **The new row fades in (opacity 0 to 1) with `translateY(8px to 0)` over the same `--k-dur-3` glide**, then holds an accent-tint highlight that fades over `--k-dur-7` (a colour animation, exception 3 below). The tile badge pops (`scale 0.6 to 1`, `--k-dur-4` spring) |
| Line remove (FLIP) | The row fades out over `--k-dur-2`, then is removed. The rows below animate from `translateY(h)` to 0 over `--k-dur-3` |
| Line expand to show its stepper | The expanded content renders below the row; the rows beneath FLIP down over `--k-dur-3` |
| KDS bump | FLIP: the ticket travels to the Ready lane over `--k-dur-5`; its lane closes up over `--k-dur-3` |
| Number roll | Changed digits roll vertically over `--k-dur-6` glide: an increase enters from below, a decrease from above, the same in RTL. Tabular figures keep the width fixed. No count-up on first paint |
| **KPI value into the detail header** (shared element) | See the recipe below |
| Press | Scale to 0.97 over `--k-dur-1`, release on spring `--k-dur-4`. Rows do not scale; their fill changes |
| Skeleton | Opacity loop over `--k-dur-9` |
| **Store lock entrance** (§10.26; revision 14, P9; revision 21: the shipped screen covers the till and makes it `inert`, it does not remove it) | The lock covers the till's surface, rail included, and everything under it is `inert`, as shipped (`till-tenant.js@762bb255:247-258`). It fades in (opacity 0 to 1) over `--k-dur-3` glide, on top of the till, with `scale(1.02 to 1)`. It does not travel, because the lock is a state of this till, not a place pushed onto it. Focus moves to its heading in the frame the lock is inserted, not after the fade, so a screen reader starts reading at once. Its primary opens the pairing pad over it, and the pad enters as a pad does (§10.2); the pad's Back removes the pad as a pad leaves and the lock is shown again with no motion of its own, focus on its heading (revision 22, F2). Its second action reloads the page, which has no motion of its own. **When the till is paired back,** the lock, hidden behind the pad, is removed at the next check (§10.26) with no motion of its own, and the pad's success leads to the staff pad (§10.2) |

**Shared-element recipe (KPI tile to detail, §10.21).** One element moves; nothing is re-laid out mid-flight.
1. **First:** on tap, read the tile value's rectangle (Title, 28 px) with `getBoundingClientRect()` before navigating. That is a viewport rectangle.
2. **Last:** push the detail page and render its header figure at its **final** step (Display, 44 px) in its final place, in the same frame, with opacity 1. **Its rectangle is measured in the pushed page's final layout frame**: the pushed page is laid out at `translateX(0)` (its resting place), the figure's `getBoundingClientRect()` is read there, and only then is the push transform (`translateX(100%)`) applied for the first painted frame. Measuring after the push transform is applied would add the page's own travel to the figure's and double it. Both rectangles are then viewport rectangles of resting layouts, so their difference is the figure's own path. Hide the tile's value (opacity 0) for the duration.
3. **Invert:** set the header figure's `transform` to the translation between the two rectangles' start edges and baselines, **minus the page's push offset at each frame** (the figure rides inside the page, so its own transform carries only the difference), and `scale(28 / 44)` = `scale(0.636)`, with `transform-origin` at the start edge and baseline (mirrored in RTL).
4. **Play:** animate the transform to identity over `--k-dur-5` glide, in step with the push. The type step "interpolates" only as a scale of the already-rendered glyph run, so the text never reflows and its tabular width stays constant.
   - **Tracking changes with the step**, from Title's −0.01em to Display's −0.02em (§6.2), and letter-spacing is a layout property, so it is not animated. The flying run is the Display run, scaled: in the first frame its tracking is −0.02 × 44 × 0.636 = −0.56 px per glyph, against the tile's −0.01 × 28 = −0.28 px. WebKit adds letter-spacing after every glyph, so over the Orders tile's "137" (3 glyphs, §18.1) the scaled run is 3 × 0.28 = **0.84 px narrower** than the tile's value it replaces; anchored at the start edge, only the end edge differs, by 0.84 px, in the first frame of a 350 ms travel. Every Home tile value in the fixture is three glyphs ("137", "140", "66%", and "3" is one), so 0.84 px is the worst case on Home; a six-glyph tile value such as a Report tile's "12,655" would give 1.7 px. That is accepted and stated, not hidden; `shared-element-test` asserts the first-frame end-edge difference is ≤ 2 px for the longest tile value in the capture. (Revision 5 worked this on "19,174", which is the Display key figure, not a tile value.)
5. **Back:** the same in reverse on the pop, over `--k-dur-5` glide; an edge swipe drives the progress interactively, and a release animates from the current transform (§14.3).
6. **Reduced motion:** no travel and no scale; the detail crossfades in over `--k-dur-2`, and the figure appears at its final size.
7. **Colour:** the figure is ink-1 in both places, so nothing else animates.

**Named exceptions to "transform and opacity only":**
1. The **lens width** in horizontal tracks and the **lens height** in vertical rails and sidebars. The lens is an absolutely positioned element; its position moves by `transform: translate()`, and only its length animates (`width` or `height`, `--k-spring`, `--k-dur-4`), inside a track with `contain: layout style` (iOS 15.4, covered by the floor), so no sibling reflows. Paint containment is not used, because it would also clip hit testing (§10.6). The shipped `top .15s ease` becomes a `translateY`; the shipped `height .15s ease` becomes this exception with the token curve and duration (`assets/liquid-lens.js:74`, §20.5).
2. The **segmented scrolling track's** `scrollLeft` during snap.
3. **Colour** (`background-color`, `color`, `border-color`, and the colour of a `box-shadow` ring), which is paint-only and never triggers layout: button and row fills when pressed (`--k-dur-1` in, `--k-dur-2` out), the inserted line's accent-tint fading over `--k-dur-7`, the KDS recalled-ticket frame over `--k-dur-7`, and a toast's or banner's state colour over `--k-dur-2`. No other property is ever transitioned.

Nothing else animates layout. Heights of content are never animated. `motion-lint` fails a `transition` or animation on any property outside transform, opacity and the three exceptions.

### 14.5 Reduced motion
`prefers-reduced-motion: reduce` follows the iOS setting.

| Normal | Reduced |
| --- | --- |
| Travel (push, sheet, popover, FLIP, bump) | `--k-dur-2` crossfade to the true final frame |
| Springs | Glide, no overshoot |
| Lens | Fades to the new segment over `--k-dur-2` |
| Number roll | Instant swap |
| KPI shared element | Crossfade over `--k-dur-2`, no travel or scale |
| PIN shake | None. Danger dots, the message and the haptic remain |
| PIN verifying pulse, skeleton pulse | Static; "Checking" text |
| Paid moment | Static for `--k-dur-8`, no scale |
| Store lock entrance (revision 14, P9) | `--k-dur-2` crossfade, no scale; focus moves as in §14.4 |
| Store lock exits (revision 16, P6): into the staff pad, and into the till for a store with no staff codes | The same `--k-dur-2` fades, opacity only; focus moves as in §14.4 |

`motion-park-test` asserts that no element is mid-transform 500 ms after any transition ends, **excluding** elements marked `data-k-loop` (spinner, skeleton, PIN verifying pulse), which loop by design and are checked instead for a static frame under reduced motion.

### 14.6 Screen readers
- Rolling digits are `aria-hidden`; a visually hidden sibling holds the true value.
- Bill totals announce politely after a user change ("Total 230.00 MAD"). **Live updates do not announce, with one exception (revision 10, M4):** a banner that appears without a user action is a status message and is announced once, by the rule in §10.12 (danger `role="alert"`, others `role="status"`), and the recovery line `sync.saved_again` once when the last danger banner clears. **Revision 11, M6:** the two sync rows that ask for action, `sync.blocked` and `sync.not_synced`, are status messages too (they report errors, and a sighted cashier sees a badge appear), so each is announced once, politely, when it first applies; a change in its count is not announced. Other sync rows, other counts, the chart and the clock never announce. Under the store lock nothing is announced; the lock's heading takes focus instead (§10.26).
- The KDS (Touch mode) announces new tickets politely: `kds.announce`.

### 14.7 Gesture thresholds (one table, used by §10 and §15)

| Gesture | Threshold |
| --- | --- |
| Tap | Released within 10 pt of the press point and not cancelled by a scroll (`pointercancel`) |
| Long press for options on a tile | 500 ms still (within 10 pt) |
| Chart scrub | 240 ms still (`--k-dur-3`); movement before that pans |
| Row full swipe | 60 % of the row width |
| Sheet dismiss by drag | 35 % of its height, or a fling over 800 pt/s |
| Pull to refresh | 64 pt |
| Toast dismiss | 24 pt downward, or a downward fling over 300 pt/s |

---

## 15. Haptics (iOS and Android, Capacitor Haptics 8.0.2 plus one Kiwi plugin)

**What the stock plugin offers** (`definitions.d.ts:59-71`, `Haptics.swift`): impact Heavy, Medium and Light; selection `selectionStart` / `selectionChanged` / `selectionEnd`; notification Success, Warning and Error; and `vibrate({duration})`, a Core Haptics continuous event at fixed intensity 1.0 and sharpness 1.0. The vibrate buzz carries no UI meaning and is **never used**.

**Verified behaviour of the stock plugin** (`app/node_modules/@capacitor/haptics/ios/Sources/HapticsPlugin/`):
- `Haptics.swift:9-16` creates a **new** `UIImpactFeedbackGenerator` or `UINotificationFeedbackGenerator` on every call, without `prepare()`.
- `Haptics.swift:20-27` creates the selection generator only in `selectionStart`, so a bare `selectionChanged()` is silent. Every Choose haptic is therefore a bracket.
- `HapticsPlugin.swift:29, 44, 51, 58, 65, 73` call `call.resolve()` with **no data**, so the web side learns nothing about when the haptic ran.
- On Android (`app/android` builds the same plugin, `capacitor.settings.gradle:11-12`), `Haptics.java` plays each impact and notification as a `VibrationEffect` waveform and keeps the same `selectionStarted` rule (`Haptics.java:48-59`).

**One web module, `KiwiHaptics.play(class, gestureId, step?)`:**
- It is the only web caller of any haptic API, including `navigator.vibrate`. Every shipped call site, web or native, is routed to it or removed at stage 1 (§20.3).
- It drops a second play with the same `gestureId`, so "one gesture, one haptic" is enforced in code. **The one exception is the continuous gesture** (§15.4): a chart scrub passes a `step` (the hour bucket's index), and the module dedupes on `(gestureId, step)` instead, at most one tick per step and at most one tick per 40 ms.
- It maps each class to the plugin call of §15.1, including Grab's Light fallback until Soft exists.
- It is a no-op on the web and in guest browsers, which never vibrate.

**One Kiwi plugin, `app/plugins/kiwi-haptics/`** (same layout as `app/plugins/kiwi-dynamic-type`: `package.json`, `Package.swift`, `ios/Sources`, `android`, `src`), landed at stage 1. It exists because the latency gate cannot be measured on the stock plugin, and it changes nothing that a person can feel unless owner decision 9 says so:
- `play({kind, style, mode})` with `mode: 'stock'` reproduces `Haptics.swift` exactly (a new generator per call, no `prepare()`), and with `mode: 'prepared'` uses long-lived generators (one `UIImpactFeedbackGenerator` per style, including `.soft`, one `UINotificationFeedbackGenerator`, one `UISelectionFeedbackGenerator`).
- `play` resolves with `{t: CACurrentMediaTime()}` read on the main thread **immediately after** `impactOccurred()`, `notificationOccurred()` or `selectionChanged()` returns.
- `clock()` resolves with `{t: CACurrentMediaTime()}` and nothing else. It is used for clock alignment (§15.5).
- `prepare({kind, style})` calls `prepare()` on the long-lived generator (prepared mode only; a no-op in stock mode).
- On Android it plays the same waveforms as the stock `Haptics.java` and resolves with `{t: SystemClock.uptimeMillis() / 1000}`.
- Until stage 1 lands, `KiwiHaptics` calls `@capacitor/haptics`; from stage 1 it calls `kiwi-haptics` in `stock` mode, and switches to `prepared` only with decision 9.

### 15.0 Which devices can feel a haptic (revision 6)

**iPads have no Taptic Engine.** No iPad model ships one, and on iPad `UIImpactFeedbackGenerator`, `UINotificationFeedbackGenerator` and `UISelectionFeedbackGenerator` do nothing (Apple's feedback generators only play on iPhone). Android tablets mostly have a weak vibration motor or none, and the kitchen TV, the web dashboard and every desktop have none. So every class in §15.1 is a **phone** experience, and no state may be signalled by a haptic alone (the rule this section adds to Principle 5, §2). On the devices that cannot feel it, each class already has its visual and, where a counter needs to hear it, a sound:

| Class | iPad till, desktop, web | Sound |
| --- | --- | --- |
| Paid | The paid moment: check, amount and `pay.paid` settle over the pane (§10.26) | **The paid sound**: two short tones (1,320 Hz then 1,760 Hz, 60 ms each, gain 0.05), synthesised with Web Audio like the shipped scanner blip (`assets/retail-scan.js:197-203`), so there is no audio file to download. It plays on every till surface (phone too), from the same frame as the paid moment, at the device's `device.sound` setting (This device, default on). A device whose audio session is muted plays nothing and the visual still runs |
| Commit | The lines move under the new "Sent" header; the primary changes | None |
| Failed | The pad's shake and its message (§10.2), or `pay.not_recorded` inline (only when nothing was journaled, §10.26) | None (an error tone at a counter is read by guests as an alarm) |
| Caution | The confirm sheet itself | None |
| Choose, Adjust, Grab, Shift | The selection or the changed value | None |

`KiwiHaptics.play` stays a no-op where there is no engine; `haptics-trigger-test` asserts the visual and the paid sound on the iPad captures instead of a haptic call. §18.3's hero is an iPad, so its paid moment is the sound and the settle, not a haptic.

### 15.1 Classes, against the brief's map

The brief's map (`docs/specs/2026-10-12-design-elevation-brief.md:225-236`) is followed row by row. Where the spec adds a member the map does not name, or departs from it, the last column says why.

| Class | Feel | Brief row it implements | Members | Additions and departures, with the reason |
| --- | --- | --- | --- | --- |
| Choose | `selectionStart` → `selectionChanged` → `selectionEnd` (a bracket; for a scrub it stays open for the whole gesture) | "Tab, segment, pill change: selection" | Tab, rail and sidebar change; segmented; radio chips (pills); date cell; **radio rows, the payment method list included** (revision 8, F13) | **Added:** chart scrub ticks (one per hour bucket, the continuous-gesture exception of §15.4) and PIN, pairing and clock-in digits except the last, because both are a series of discrete choices, which is what selection feedback is for |
| Adjust | impact Light | "Add item to bill, stepper +/-: impact light" and "Pull to refresh threshold: impact light, once" | Add an item: a tile tap for an item with no required options, **and `options.add` for an item added through the options sheet** (§10.24; the tile tap that opens the sheet fires nothing, so the add is one haptic); stepper + and −, **including a step to 0 that removes an unsent line**; `bill.remove`; pull to refresh passing 64 pt, once | **Added:** cash keypad keys (a stepper over amounts), the switch toggle (a small local state change, as UIKit's own switch), and applying a discount (a local bill change, like adding an item; nothing is sent until payment, §10.31) |
| Commit | impact Medium | "Send to kitchen, open till, confirm table: impact medium" | `bill.send`; `count.open` (the opening float recorded); `ai.actions.confirm` and `ai.actions.undo` (revision 23, §18.6); `online.accept`, accepting an online order (revision 25, §18.3) | **Added:** the last two have no local record, so they fire on the server's `ok` (`trigger: 'server-ack'`, §15.2) |
| Paid | notification Success | "Payment accepted, shift closed: notification success" | A sale recorded (cash, card, other, or a share of a split); `count.close` (the till closed, which is the "shift closed" of the brief) | None. Paid fires **only** on a local record (§15.3), and its test says so |
| Shift | notification Success (the same feel as Paid; a separate class because its trigger differs) | "Shift closed: notification success", applied to one person's shift | Clock-in and clock-out in the team app, on the server's 200 | **Added, with its own class:** revision 4 put clock-in under Paid, but a clock-in is a server verdict (`employee.js:474-530`), not a local record, so Paid's test (`trigger: 'local-record'`) would have failed. Shift fires on `trigger: 'response'` from `POST /api/employee` with `action` `clock-in` or `clock-out` only, within 600 ms (§15.3) |
| Failed | notification Error | "Code wrong, payment declined: notification error" | A code refused: 401 `bad-pin`, 401 `bad-employee-code`, 409 `employee-access-ambiguous`, 403 `attendance-code-invalid`, 422 `invalid_or_expired`, 403 `manager-required` and a manager approval refused for its role; a till lock or a till approval refused for its role (`pin.not_till`, `pin.till.not_till`, revision 17, M1); a shift change approved by someone other than the incoming cashier (`pin.till.not_incoming`, revision 19, M2); and an offline refusal by a verifier row (`pin.offline_unknown`, `pin.dashboard.offline_unknown`, revision 17, P3) | **Departure:** "payment declined" cannot happen, because card is record-only (§10.26). Its nearest real event, **a sale the till did not record at all** (`pay.not_recorded`, nothing journaled), fires Failed instead; a sale recorded on the till that the outbox refused is Paid, with the sync indicator (§10.26) |
| Caution | notification Warning, **before**; nothing after | "Destructive confirm (void, refund): notification warning before, none after" | A Tier B or C confirm sheet opened by a tap; a row swipe that passes 60 % on a Tier B action (instead of Grab) | None |
| Grab | impact **Soft** with owner decision 9 (`kiwi-haptics` prepared mode); impact Light until then | "Long press, drag start: impact soft" | Long press reaching 500 ms (options on a tile); a row swipe passing 60 % on a Tier A action; the start of an object drag (menu and floor-plan editors, none on work surfaces today) | **Departure, forced:** the stock plugin has only Heavy, Medium and Light (`definitions.d.ts:53-71`). **Sheet drags are not object drags** and stay silent (§15.6): moving or dismissing a sheet is navigation |

**No haptic on a successful code** (dashboard and till unlock, Face ID, team sign-in, pairing, a manager's approval). The brief maps only "code wrong", the new screen is the confirmation, and a till unlocks dozens of times a shift, so a Success there would make the busiest gesture of the day buzz. A manager's approval hands over to the act it approved, whose own class applies, under the response rule of §15.3 (Adjust for a discount, nothing after a Tier B confirm).

Impact Heavy is **unused**: nothing in a POS deserves more weight than a recorded payment.

### 15.2 When a class fires

- **Pointerdown** only on pads that can never scroll and are excluded from sheet drags (§10.3): PIN pad keys and cash keypad keys. These fire at the press, as iOS keyboards do.
- **Confirmed tap** (§14.7) everywhere else: menu tiles, steppers, segmented, chips, switches, rows, buttons. The menu grid, bill pane and cash count all scroll, so a scroll that starts on a tile or stepper ends in `pointercancel` and fires nothing.
- **Threshold frame** for Grab, Caution on a swipe, and pull to refresh.
- **Local-record frame** for Commit and Paid (below).
- **Server-ack frame** (revision 25, P1) for Commit on an act that writes nothing locally and is done only when the server says `ok`: an Action Center confirm or undo (§18.6) and accepting an online order (§18.3). It fires on the frame the `ok` is applied, only when that frame is within 600 ms of the tap, and never on a refusal or a late answer. It is not "a server acknowledgement of something already recorded" (§15.6): here the answer is the act.
- **Response frame**, under the 600 ms rule, for Failed on a code, Shift on a clock-in or out, and the Adjust that follows a manager's approval of a discount (below).
- **Step frame** for the ticks of a chart scrub, the only continuous gesture (§15.4).

### 15.3 What each commit waits for, by name

Two rules, because the till is offline-first, and a code is checked by the server online and, offline, only against a verifier row on the till or, with owner decision 2 (b), on the dashboard (§10.2; revision 17, P3):
- **Acts the till records locally** (a sale, a kitchen send, a table opened, the till opened or closed) fire on the frame the **local record** is written, never on a server response. The server's acknowledgement then drives the sync indicator (§10.26) or the bill's saved state, and a later refusal shows on screen with no second haptic. So the paid moment and its haptic work offline and never wait a round trip.
- **Server verdicts** (codes, clock-in and out, a manager's approval) fire only when the response arrives **within 600 ms of the final digit**. A later answer updates the pad but fires nothing, so a slow network never buzzes under the next gesture. **An offline verdict is a verdict** (revision 17, P3): when the request throws and a verifier row decides, the haptic fires on the frame the row's answer is known, under the same 600 ms rule, so an instant offline refusal fires Failed and a verdict reached only after the 8 s timeout fires nothing. **An automatic retry's answer fires nothing** (§10.2's retry rule); only a request the person caused can fire.

| Gesture | Request (named) | Haptic, and the frame it fires on | Failure path |
| --- | --- | --- | --- |
| Confirm cash, confirm card, pay a share | `recordSale` writes the journal and the outbox's synchronous write-ahead copy (`kiwi-caisse.html:14530`, `assets/live-link.js:750-768`); IndexedDB then takes the sale over asynchronously (`:769-783`) and the outbox sends `POST /api/sale` (`functions/api/sale.js`) | **Paid** on the frame `recordSale` returns the record (the paid moment's first frame, as `nativeHapticSuccess()` at `kiwi-caisse.html:11401` does today), whatever the outbox answered (§10.26 item 3). **For a share, only when `markSplitPartPaid`'s `recordSale` returned an entry**: today `nativeHapticSuccess()` at `:11396` fires after the split callback even when the share was refused (`:13699-13701`); the kit's callback returns the entry and Paid fires only on it, which `haptics-trigger-test` checks with a refused share (Success only on a confirmed record) | **Nothing journaled** (`recordSale` returns nothing before `journal.push`, so the till throws `sale-not-recorded`, `:11390`; for a share, `:13699-13701`): **Failed**, `pay.not_recorded`, no paid moment, and a retry is safe. **Journaled but refused by the outbox** (`queue-storage-full`, `sale-sync-unavailable`, `sale-enqueue-failed`, `kiwi-caisse.html:14735-14746`), a later `storageError` (`live-link.js:781`) or a server 4xx: Paid has already fired; the sync indicator's persistent count and banner say the rest, and recovery is the stable-id replay, never a second sale; no haptic (§10.26) |
| Send to kitchen | The lines move to the bill's Sent group and the kitchen job is queued locally; the till then sends `POST /api/order/queue {create:true, table, lines}` (`functions/api/order/queue.js:964-969`) | **Commit** on the frame the lines move to Sent | A refusal or a send still pending after the connection returns: `bill.unsaved` banner on the bill; no haptic |
| Open the till | The opening float is written to the cash-session outbox, which sends `POST /api/cash-sessions` (`assets/cash-sessions.js:170-185`) | **Commit** on the local write | The count sheet shows the outbox's error; no haptic |
| Close the till (count saved, shift closed) | The closing count is written to the same outbox; the Z report then renders from `POST /api/z-reconciliation` (`functions/api/z-reconciliation.js:32`, called by `assets/z-reconciliation.js:127`) | **Paid** once, on the frame the closing is committed: `registerClosed` is set and the post-close screen is shown (`kiwi-caisse.html:16446-16450`; revision 18, P8). Not on the tap, and not on any server answer. Before that commit the till waits up to 8 s for the day's sales feed (`syncSettledBusinessDay({timeoutMs: 8000})`, `:16384`), then saves the report and queues the Z locally; that wait is the sheet's quiet busy state (`count.close` busy, §10.1's Loading row: no haptic, nothing announced but the busy label). The Z response fires nothing. The 600 ms rule does not apply, because the commit is a local record | A close that fails before the commit (the report or the Z queue cannot be saved, `:16408-16426`) keeps the shift, reopens the sheet with its error, and fires nothing |
| Apply discount | Every discount needs a manager's code, as shipped (`kiwi-caisse.html:18166`, `requireManager` at `:17319`). The pad sends `POST /api/pin/verify {merchant, pin}`; the discount is then held on the bill and travels inside the sale's `POST /api/sale` body (`sale.js:178-190`) | The Apply tap that opens the pad fires nothing. **Adjust** on the response frame, when the verified role is a manager and the answer arrives within 600 ms of the final digit; a later approval applies the discount silently | A refusal: **Failed** within 600 ms (row below); the bill is unchanged. A server refusal of the discounted sale later shows as a blocked sale; no haptic |
| Final PIN digit, dashboard lock and till lock | `POST /api/pin/verify`; when the server cannot answer, the device's rows (§10.2) | 200 with a role the lock accepts, or a row match with one: **nothing**. 401 `bad-pin` (not No codes yet); 200 or a row match with a role that does not open the till (till lock, `pin.not_till`); and a no-match when the server cannot answer (`pin.offline_unknown`, `pin.dashboard.offline_unknown`, and the dashboard's `pin.unavailable` online): **Failed** within 600 ms | 401 `unauthorized`, No codes yet (revision 20), 403, 429, the dashboard's offline pause, and a till-lock 503: nothing (the message or the setup says it). **Trace:** `haptics-trigger-test` cuts the network with a row present (match, wrong role, no match) and with none, on both locks, and asserts nothing, Failed, Failed and Failed |
| Final digit, till approval (revision 17, M1) | `POST /api/pin/verify`; when it throws, the till's rows | 200 or a row match with a role that opens the till: the act's own class, by that act's own row (a closing's Paid follows the close row above, where the 600 ms rule does not apply; revision 19, P6). 401; 200 or a row match with a role that does not open the till (`pin.till.not_till`); a shift-change 200 that is not the incoming cashier (`pin.till.not_incoming`, revision 19, M2); an offline no-match: **Failed** within 600 ms | 403, 429, 503: nothing. An act that needs a connection, offline: nothing at any point, because no code can be entered and the verifier is never consulted (§10.2; revision 18, M3). **Trace:** the same test, with a cashier's, a waiter's and an unknown code, online and offline; each trace entry decided by a row is marked `verdict: 'offline'` with the row's `provenAt` (revision 18, M4) |
| Final digit, manager approval | `POST /api/sale/cancel` (cancel) or `POST /api/pin/verify` with or without `action` (§10.2); offline, the till's rows for the acts approved by role | 200 with a manager role, or a row match with one (a discount, the drawer): the act's own class, under this same 600 ms rule. 401, 403 `manager-required`, a non-manager role online or from a row, and an offline no-match: **Failed** within 600 ms | 429, 503, and a throw on an act the server must approve (`pin.manager.offline`): nothing |
| Final digit, team sign-in | `POST /api/employee {action:'login'}` | 200: nothing. 401, 409: **Failed** within 600 ms | 403, 429, 503, network: nothing |
| Final digit, clock-in or out | `POST /api/employee {action:'clock-in' or 'clock-out'}` (`employee.js:474-530`) | 200: **Shift** within 600 ms. 403 `attendance-code-invalid`: **Failed** within 600 ms | 401 `employee-session-required`, 403 `store-suspended`, 429, 503, network: nothing (the pad says it) |
| Final digit, pairing and the store lock's pad | `POST /api/pair/redeem` | 200: nothing. 422 (`pair.invalid`, or `pair.maybe_used` after a redeem that got no answer): **Failed** within 600 ms | 429, 503, no answer (`pair.no_answer`): nothing |
| Confirm or undo an agent action (the Action Center) | `KiwiAgentActions.confirm(token)` for the entry's token, from `approve()` and `undo()` (`assets/agent-action-center.js@319ac100:153-185`); an expired token is renewed once and confirmed again | **Commit**, `trigger: 'server-ack'` (§15.2; revision 25, P1), on the frame `settle` records the entry as approved (`:123-129`), and `undo` records it as undone (`:183`), when the answer is `ok` and arrives within 600 ms of the tap. The 600 ms run from the tap, renewal included, so the answer to a renewed token counts only if it lands inside them. A renewal that answers `replayed` (`:159`) records the entry approved without a second confirm; that frame fires Commit too, inside the same 600 ms, because the act did complete | A refusal, a network failure, a refused renewal and a late answer: nothing (the card shows its status word) |
| Accept an online order (revision 25, M2) | `POST /api/order/queue {merchant, id, status: 'accepted'}` (`assets/orderpro-inbox.js@31c94529:256-282`) | **Commit**, `trigger: 'server-ack'`, on the frame the card moves to `online.in_kitchen`, when the `ok` lands within 600 ms of the tap | A refusal, a network failure or a late answer: nothing; the card stays and `online.not_confirmed` says so |
| Confirm a Tier B or C act | Its route (for example `POST /api/sale/cancel`) | **Never** (the brief: none after) | Never |

### 15.4 One gesture, one haptic: the cases, and the one continuous gesture

| Gesture | Haptic |
| --- | --- |
| Stepper from 1 to 0 on an unsent line | Adjust only (the removal is part of the step) |
| Row swipe to a Tier A action | Grab at the 60 % threshold only; the release performs it silently |
| Row swipe to a Tier B action | Caution at the threshold only; the confirm sheet then opens silently |
| Switch whose remote save fails | Adjust on the toggle only; the failure is shown inline and the knob returns (§10.10) |
| Close the till | One Paid, on the frame the closing is committed (`registerClosed`, §15.3; revision 18, P8), never on the tap or the sync before it |
| Final digit of any code | Only the verdict (Failed, or Shift for clock-in and out), never a Choose |
| Apply a discount | The Apply tap fires nothing; Adjust once, on the approval's response frame within 600 ms |
| Charge (`bill.take_payment`) | Opens the pane; nothing |
| **Chart scrub (the continuous-gesture exception)** | One Choose bracket for the whole gesture: `selectionStart` when the 240 ms hold starts the scrub, one `selectionChanged` per hour bucket the finger enters, `selectionEnd` on release. Each tick is played as `play('Choose', gestureId, step)` with `step` = the bucket index; a bucket already ticked in this gesture (the finger going back over it) does not tick again; ticks are at least 40 ms apart, so a fast sweep across 24 buckets plays at most 25 ticks per second and skips the rest |

The chart scrub is the **only** gesture allowed more than one haptic, and Principle 5 (§2) names it. Its ticks are one class (Choose) inside one bracket, so the gesture still has one feel.

### 15.5 Throttle, latency and preparation
- **Throttle:** Choose ticks at least 40 ms apart (the shipped `tick`, `native-runtime.js:2096-2101`); other classes at least 60 ms.
- **What is measured:** from the web event's `timeStamp` to the moment the generator call returned on the native side, read from `kiwi-haptics` (§15 intro). The physical actuator's own delay after that call is a property of the device and the same in every mode, so it is outside the budget.
- **Clock alignment:** the web clock (`performance.timeOrigin + event.timeStamp`) and `CACurrentMediaTime` have different origins. At the start of a trace, `KiwiHaptics` calls `clock()` 20 times; for each call it records `w0 = performance.now()` before and `w1` after, and the native `t`. The offset is the median of `t − (w0 + w1) / 2` over the 5 calls with the smallest `w1 − w0`, and its uncertainty is half of the smallest round trip (the trace records it; above 2 ms the trace is discarded and redone). Latency = native `t` − (`event.timeStamp` + offset).
- **Stage 1 measures the baseline** on an iPhone 12 with `kiwi-haptics` in **stock** mode (the same generator behaviour as today), for each class, 200 events per class, and writes the p95 into the evidence pack and into §19 before stage 2 starts.
- **Without decision 9** (stock mode in production): the budget is **no regression**, p95 ≤ the measured baseline + 5 ms for every class. That is the gate.
- **With decision 9** (prepared mode: long-lived generators, `.soft`, and `prepare()` called on pointerdown of any control whose class fires on release, and on the final code digit before the request goes out): the budget becomes **≤ 20 ms p95**, measured the same way.
- **Android:** traced the same way (`uptimeMillis`), reported, and not gated in this direction; the merchant fleet is iPad and iPhone (§4).
- Either way the round fails only on the gate that applies, so no budget depends on an undecided item.

### 15.6 Never buzz
- scrolling or snap;
- typing in text fields;
- a toast appearing (the shipped `kiwi:toast` hook is removed at stage 1, §20.3);
- live updates, polls, sync, or a new order arriving, **including the kitchen screen and the order inboxes** (the shipped `navigator.vibrate` calls on new orders are removed, §20.3);
- a server acknowledgement of something already recorded (§15.3);
- timers;
- number rolls;
- page loads, pushes, pops and horizontal panel swipes;
- **sheet drags, sheet presentation and dismissal**, web or native. The native sheet's own Warning call is removed; a native sheet that confirms a destructive act gets Caution from `KiwiHaptics` before it is requested, exactly like a web confirm sheet (§20.3);
- a successful code (§15.1);
- hover;
- disabled controls;
- the cash drawer;
- showing a code (attendance, printer);
- **anything on the KDS, including its pairing pad** (the PIN pad's haptics are off when its host is the kitchen surface);
- decoration.

**Settings:** Settings › Haptics (default on) and the till's This device › Haptics turn them off. iOS System Haptics is respected by the OS.

**Evidence:** `?hapticsTrace=1` records `{t, class, call, gestureId, step, latencyMs, trigger, route}` where `trigger` is `pointerdown`, `tap`, `threshold`, `local-record`, `server-ack` (revision 25, P1), `response` or `step`, and `route` names the request for a `response` or `server-ack` trigger. `haptics-map-test` asserts:
- every Choose call is bracketed;
- no `gestureId` appears twice, **except** with `trigger: 'step'`, where no `(gestureId, step)` pair appears twice and the steps of one gesture are at least 40 ms apart; `step` is allowed only on the chart scrub's gesture type;
- no `response`-triggered haptic fires more than 600 ms after its gesture's final digit;
- **Paid** fires only with `trigger: 'local-record'`;
- **Commit** fires only with `trigger: 'local-record'`, or with `trigger: 'server-ack'` and `route` equal to `KiwiAgentActions.confirm` (an Action Center confirm or undo) or `POST /api/order/queue` with `status: 'accepted'`, and then no more than 600 ms after its gesture's tap;
- **Shift** fires only with `trigger: 'response'` and `route` equal to `POST /api/employee` with `action` `clock-in` or `clock-out`;
- the Adjust that follows a discount approval fires only with `trigger: 'response'` and `route` `POST /api/pin/verify`;
- no haptic fires inside a recorded scroll or sheet drag, and none on the kitchen surface;
- each class's feel matches §15.1;
- a static scan finds no `navigator.vibrate`, no `UIImpactFeedbackGenerator`, `UINotificationFeedbackGenerator` or `UISelectionFeedbackGenerator` outside `app/plugins/kiwi-haptics/`, and no `Haptics.` call outside `assets/kit/haptics.js` (§20.3 lists every site this removes).

---

## 16. Accessibility settings

| iOS setting | How the web layer learns it | Kit response |
| --- | --- | --- |
| Larger Text | `KiwiDynamicType` (shipped) | §6.4 |
| Reduce Motion | `prefers-reduced-motion` | §14.5 |
| Increase Contrast | `prefers-contrast: more` | `--k-line` becomes `--k-line-strong`; ink-3 becomes ink-2; the selection edge is 2 px; the focus ring 3 px; chrome becomes solid |
| Reduce Transparency | Not exposed to WebKit CSS. **Bridge needed:** extend the plugin with `getAccessibilitySettings()` and a change event (`UIAccessibility.isReduceTransparencyEnabled`) | All chrome solid surface-1 with a hairline; the scrim stays |
| Bold Text | Bridge (`isBoldTextEnabled`) | Weights +100: 400 to 500, 500 to 600, 600 to 700. Both faces contain 700 (§6.1), so WebKit never synthesises a bold |
| Button Shapes | Bridge (`buttonShapesEnabled`) | Plain buttons underline 1 px; icon buttons get a surface-2 circle |
| VoiceOver running | Bridge (`isVoiceOverRunning`) | Action toasts never time out |
| Any screen reader (no setting needed) | Live regions, which every reader honours | **Status messages (revision 10, M4):** a banner that appears without a user action is announced once (danger `role="alert"`, others `role="status"`), and `sync.saved_again` once on recovery (§10.12, §14.6); **revision 11, M6:** `sync.blocked` and `sync.not_synced` once each, politely, when they first apply. `banner-announce-test` (stage 4, in the existing puppeteer-core harness) mounts each banner from a timer and asserts, with a `MutationObserver` on the slot, that the region with its role was in the DOM before the text, that the text was written exactly once, and that ten more autosave ticks write nothing. **Revision 11 cases:** the outbox reports `blocked` 0 then 2 then 3, and the polite region receives `sync.blocked` once, at 2, and nothing at 3; refused entries go from 0 to 1 to 2 and `sync.not_synced` is written once; the row clears and applies again and is written again; and with the store lock showing, neither region is written while the outbox changes, and focus is on the lock's heading. What VoiceOver then speaks is checked by hand with VoiceOver on an iPad at each stage's sign-off, not claimed by the script |
| Darker System Colors | Same as Increase Contrast | |

The bridge is a native change: plugin v2, a new App Store build, TestFlight. Until it ships, materials stay on, weights stay unchanged, and action toasts still pause while touched or focused and have a non-timed path (§10.17). This is flagged in §23.4.

---

## 17. Data honesty rules

1. **One ledger, on each store's business day.**
   - `<k-figure key>` reads `KiwiLedger`. A literal number in figure markup fails the lint.
   - Ranges resolve with `businessDate(ts, cutoff, zone)` exactly as `functions/api/_business-day.js` does, with the store's `businessCutoff` and `timezone` from `/api/config`.
   - **The fallback is stated, not hidden.** Today `/api/config` sends `businessCutoff: null` and `timezone: ''` when the store has no valid `merchant_config` row (`config.js:281-282`, filled only at `:313-317`), while the server itself falls back to 5 and `Africa/Casablanca` (`merchantCutoff()` and `merchantZone()`, `_business-day.js:60-76`). So:
     - `assets/kit/business-day.js` is the **only** client file that holds the defaults, as `DEFAULT_CUTOFF = 5` and `DEFAULT_ZONE = 'Africa/Casablanca'`, and resolves `cutoff = config.businessCutoff ?? DEFAULT_CUTOFF` and `zone = config.timezone || DEFAULT_ZONE`. `kit-lint` fails a literal cutoff anywhere else.
     - `business-day-default-test` reads `functions/api/_business-day.js` and `assets/kit/business-day.js` and fails if their defaults differ.
     - **Stage 1 server change:** `/api/config` returns `businessCutoff: await merchantCutoff(env, merchant)` and `timezone: await merchantZone(env, merchant)`, so a store without a row gets the resolved values from the same functions the ledger uses. The client fallback stays for an older deployment and is what the test covers.
   - A closed day is read with the cutoff its Z report recorded. When two Z reports for one day disagree (the server's `cutoffConflict`, `z-reconciliation.js:169`, reported as `ambiguousReason: 'cutoff-conflict'` at `:261`), the day shows `z.cutoff_conflict` and each report's own figures.
   - Copy and axes are built from the cutoff: the date-range note (§10.19), the chart axis (§10.22) and the Z header (§18.9).
   - `ledger-agreement-test` asserts equal values for equal keys across Home, Orders, Report, Notifications, Z, Terminals, Team and Kiwi AI on fixtures for **four stores**:
     - cutoff 5 in `Africa/Casablanca`: sales at 04:59 (previous day) and 05:00 (new day), and a business day spanning the Ramadan clock change;
     - cutoff 3: sales at 02:59 and 03:00;
     - cutoff 0 (calendar days): sales at 23:59 and 00:00;
     - **a store with no cutoff row and no zone**, run twice: once against today's `/api/config` (null and empty, so the client fallback applies) and once against the stage 1 route (resolved values); both must give the same business days as the server, with sales at 04:59 and 05:00 Casablanca time;
     - plus a store whose cutoff changes from 5 to 7 between two days, checked against `z-reconciliation`'s rule that a historical Z is never reinterpreted.
2. **Every comparison names its baseline,** in full: "vs yesterday at 17:39", "vs last Monday at 17:39". The compare control (§10.33) is the one selector for Home and Report, and it shows each baseline's value.
3. **No seed beside live data.**
   - A view is entirely live or entirely demo.
   - An uncomputable figure shows the not-computable state.
   - Card last-four digits, bank names and terminal states are never invented. The seeded last-four generator (FNV-1a over `venue-date-index` feeding a mulberry-style PRNG, `dateRange.js:4366-4376`) is deleted, and card rows show "Card".
4. **Demo data is marked and deterministic.**
   - The "Demo data" capsule appears in every demo page header, including App Store frames.
   - Demo data is seeded by store and business day.
   - Demo codes never appear on a till surface.
5. **Every total lists its parts.**
   - **Expected cash is the shipped expression**, quoted from `assets/day-report.js:719`: `round2(opening + cashSales + cashTips + movesIn - movesOut)`, so Opening float + Cash sales + Cash tips + Cash in − Cash out, each on its own line. **There is no refunds term:** `cashSales` is already net of cash refunds (`day-report.js:717`, "déjà net des remboursements espèces"). Cash refunds appear only as an explanatory sub-line under Cash sales (`count.cash_refunds_sub`, "After 120.00 MAD refunded in cash"), which carries no `data-k-part` and never enters the sum. Revision 6 printed "− Cash refunds" as a term, which would have subtracted them twice.
   - A Z total lists its methods; a split bill's shares sum to its total.
   - `components-sum-test` enforces this.
6. **Freshness is visible:** "Updated 17:39" when a figure is more than 2 minutes old; `wifi_off` when offline.
7. **One segmentation:** `segmentCustomer(visits, businessDate)` puts every customer in exactly one status by the first matching rule: **New** if the first visit is 30 days ago or less, else **Inactive** if the last visit is more than 60 days ago, else **Regular** (§18.0). It reads dated visits, never a lifetime count, so the result can be checked. VIP is a separate marker. Customers, Retention and Kiwi AI use it.
8. **Denominators are labelled:** "3 of 8 known customers".
9. **No dead controls:** a control without a handler is not rendered.
10. **No consequential pre-selection:** business type, opening float, payment method, required options, reasons, discount value.
11. **Payments and hardware are described as they are:**
    - card is recorded, not authorised;
    - Kiwi never claims a card refund or decline it cannot see;
    - Kiwi never claims a drawer opened; it says the signal was sent (§10.26);
    - Kiwi IQ reads figures server-side, so the product never says "end-to-end encryption".
12. **Ledger rollout is flagged** (§21.2). It is never switched silently on live data.

---

## 18. Hero screens

Coordinates are in pt from the top-left (mirrored in AR). Every gap between bands in the flow is a spacing token (§7.1); the distance from the last band to floating chrome is ≥ 8. Separate controls are ≥ 8 apart; members of one contiguous control may abut (Principle 4). Each hero lists the type steps it uses (≤ 6, which the scale guarantees, §6.2) and its Principle 1 result. The before-and-after page renders the six brief screens, an AR frame and a 375 × 667 frame from these numbers and from the fixture below (`docs/specs/kiwi-design-2027-preview.html`).

### 18.0 The worked example (one fixture behind every hero and the preview)

Every figure, name, time and label that §18 draws and that is not a keyed string comes from one fixture: **Café Atlas, a restaurant, Monday 12 October 2026, cutoff 5, `Africa/Casablanca`.** It has two states: **the service state at 17:39** (every hero except the close) and **the close state at 23:41** (§18.9's count and Z). It is written once as `tools/fixtures/worked-example.json` at stage 1; the preview embeds the same data and checks its frames against it in the page, and runs the mutation table below on itself. `strings-coverage-test` (§9.6) accepts a quoted UI string only if it is a key or a value in this fixture.

**What "comes from the fixture" covers, and what is checked (revision 9, M5; revision 10, P1).** Every drawn value below comes from the fixture; **the preview compares exactly what the checks list** (nineteen since revision 25: revision 23 retires check 6 with the floor's frame, revision 24 adds check 18, the daily goal, and check 19, the controls present, and revision 25 adds check 20, the trade's suggestions) and nothing more, and it compares **code points, not folded text** (revision 10, M1): only markup whitespace is collapsed, so an ordinary space where §6.3 puts U+00A0 between a number and its unit fails, and mutations 80 to 82 prove it. Revision 10 adds to the compared set the venue name (every Home frame and both places in Kiwi AI), the floor's zone names (until revision 23), the till's category tabs in menu order and the menu grid's category headers, the weekday in the Kiwi AI suggestion ("last Monday", until revision 25, whose rows 1 to 3 name no weekday), and both ends of the chart's lines (today's first point at the cutoff and 0, yesterday's last point at the end of its day). **Drawn from the fixture but still not compared** (the complete list, as far as a review of every frame's text found): the shape of either curve between its ends and the clock; the position of every tile, row and label **where the position carries no fixture data** (spacing, alignment, which is layout); **which segment of a segmented control and which tab of a capsule is drawn as selected** (revision 22, F4: moving the selection on a frame leaves every check green, so nothing here says a frame's selection matches its figures); **whether a control without an icon is present** (revision 24, P7: check 19 holds every control that draws an icon, since each frame must draw each icon name as many times as it is written with it; revision 25, P13, adds the labels of the labelled controls, so the Kiwi AI capsule's word, Actions, Calculator and Attach are held too; any other text-only control, such as a Plain link or a segment, is held only where a check reads its text); whether a text is painted (its visibility, opacity, colour against the surface, size and position); the text checks read the text a frame holds; icons are checked for paint (check 13), and of text only the deltas' colour and fill, which check 1 compares with their polarity (their visibility, opacity, size and position are not read); and keyed strings (titles, buttons, filters, legends), which `strings-coverage-test` holds instead; the Kiwi AI suggestions are compared since revision 25 (check 20). Each customer row's avatar initials are compared too (check 17). **Revision 11, P11:** revision 10 filed two fixture facts under "layout, not data": which zone each table sits in and the order of the dishes inside a category. Both are now compared by check 17 (the plan's rows per zone, read from the tiles' positions inside each zone box, and the till's tiles read in menu order), and mutations 107 and 108 swap them. Revision 22 replaced the rows with the plan's geometry; revision 23 removes both with the floor's frame (§18.4), so check 17 no longer reads the floor, and rows 92, 107 and 184 to 188 are retired. **The store lock is checked as data, not drawn:** check 15 derives whether the lock shows, and which variant, from each case's stores and whether a service is open, and derives what each code on its pad leads to from the code's store, the connection and the roster (revision 13, B1, P5: revision 12 compared the pad and the exit with fixed strings); no frame of the preview draws the lock screen itself (its anatomy is §10.26 item 3 and §10.2). **Revision 14 (P3, M1):** all of it now goes through the one predicate §10.26 writes, which adds the roster step and leaves a service with no store out (revision 21: the predicate is now `762bb255`'s `mismatch()`, and the roster step is gone). **Revision 14 (P4): round 14 found two drawn facts unchecked, and both are now compared.** Each bill line's group is read from its drawn position (check 10). Each Orders row's method icon is read from the log (check 13).

**Venue:** one floor with two zones, Dining room (T1 to T12) and Terrace (T20 to T23), 16 tables. The fixture's `plan` lists only which tables exist and in which zone, which checks 2 and 4 read (an order or a ticket on a table that does not exist fails); the floor itself is kept as shipped (§18.4), so no frame draws it (revision 23).

**Staff** (display name · initials · role): Othmane Naciri · "Othmane N." · ON · cashier; Karim Alami · KA · waiter; Nadia Amrani · NA · waiter. The rail and the Z show "Othmane" and "Othmane N." from these fields.

**Menu** (category order as on the till; ⚙ = has options, ✕ = sold out; station in brackets):

| Category | Dishes and prices (MAD) |
| --- | --- |
| Starters | Harira 35.00 (Hot) · Salade marocaine 45.00 (Cold) · Zaalouk 38.00 (Cold) · Briouates aux crevettes 52.00 ⚙ (Hot) · Taktouka 38.00 (Cold) · Soupe du jour 30.00 (Hot) · Bissara 28.00 (Hot) · Msemen au miel 25.00 ✕ (Pastry) |
| Tajines | Tajine poulet citron 150.00 ⚙ (Hot) · Tajine kefta aux œufs 95.00 ⚙ (Hot) · Tajine agneau pruneaux 165.00 (Hot) · Tajine de légumes 85.00 (Hot) · Tajine de poisson 140.00 ⚙ (Hot) · Tanjia marrakchia 170.00 (Hot) |
| Couscous | Couscous sept légumes 110.00 (Hot) · Couscous tfaya 135.00 ⚙ (Hot) · Couscous royal 160.00 (Hot) · Seffa medfouna 120.00 (Hot) · Couscous au poisson 145.00 (Hot) |
| Pastillas | Pastilla au poulet 120.00 (Hot) |
| Drinks | Thé à la menthe 19.00 · Jus d'orange 25.00 · Café noir 15.00 (all Drinks) |
| Desserts | Cornes de gazelle 30.00 · Baghrir 22.00 (both Pastry) |

**Every total in the fixture is derived, never stored (revision 6).** Revision 5 stored totals beside line items and statuses beside the facts they summarise, so a check could compare a value with itself. Now the fixture stores only **sources**: menu prices, each table's lines with their send times, each order's lines, the kitchen's ticket log, each customer's **dated visits**, the day's method tallies, the close's cash movements and denominations, and the clock (17:39). Every figure a screen draws (a bill total, an order amount, a status, an elapsed time, a count, a segment) is computed from those sources by the checks below and compared with what the frame **draws**, which is static markup written once, not rendered from the fixture at load. Values drawn by heroes that are not in the preview (the kitchen board, §18.7, and the close, §18.9) are transcribed in a `drawnElsewhere` block and checked the same way.

**Day so far (17:39), from the method tallies:** card 79 orders, 12,700.00 gross, 45.00 refunded, so 12,655.00 net; cash 58 orders, 6,519.00. So **137 orders and 19,174.00 MAD net of refunds**, card share 66 %. Yesterday at 17:39: 133 orders, 20,301.00 MAD, card 13,195.00 (65 %); yesterday's whole business day closed at **30,100.00 MAD**, the larger series' maximum, which the chart puts on its band edge and labels "30.1K" (§10.22). The till is signed in as **Othmane Naciri** ("ON"), and its bill pane shows Table 4. Notifications: 3 unread (ticket 42 late, Table 9 asked for the bill, Harira base low).

**The daily goal (revision 24, M2), `goal`:** 23,500 MAD, the venue's daily goal as onboarding's goals step and Settings › Business write it. The day's revenue at 17:39 is 19,174, so the goal line reads 82% and its mark is filled to 81.6% (check 18).

**The trade and the shop (revision 25, M1), `trade`, `costsSet`, `aiShop`:** Café Atlas is a `restaurant` with its costs set up, so the Kiwi AI frame asks the restaurant's three questions, then the two simulators. The second Kiwi AI frame is a shop, **Atelier Lina**, a `boutique` with no costs set up, no sale yet today and nothing waiting in its Action Center: it asks the shop's three questions, then the new-store questions and the shop's operational one, and draws no Today card and no badge (check 20).

**Online orders (revision 25, M2), `onlineOrders`:** one takeaway order, W-14, placed at 17:37 and still pending. So the till's Takeaway tab carries a badge of **1** (check 16), the count of pending online orders placed no later than the clock.

**The Action Center's queue (revision 23, M1), `aiActions`:** a stock adjustment and an order status waiting for a decision, and a stock adjustment completed. So **2 pending**, which the Kiwi AI frame's Action Center draws as its badge, and which check 16 counts.

**Notifications (revision 9, M5), the source of the bell's badge:** ticket 42 late (unread), Table 9 asked for the bill at 17:30 (unread), Harira base low in stock (unread), and last night's Z 0146 closed (read). So **3 unread**, which every Home frame's bell draws as its badge, and which check 16 counts.

**Tables (16; 5 not free).** Status is derived from the record and the order log by the first rule that matches (revision 23 keeps here what §18.4 held, because check 2 still reads it: an order settles only a table it pays or that is free): Paid, when an order in the log settles the table's current opening; Bill asked; Ordering, with at least one unsent line; In progress, with lines all sent; Open, opened with no line; Free, no opening; a line's amount is quantity × the menu price:

| Table | Zone | Guests · opened · staff | Lines (S = sent, with time; U = not sent) | Derived status · total |
| --- | --- | --- | --- | --- |
| T2 | Dining room | 2 · 16:58 · Karim | S 17:10: 1 Tajine de légumes, 1 Briouates aux crevettes, 1 Thé à la menthe | **Paid** (order #1208 at 17:36 settles it) · 156.00 |
| T4 | Dining room | 3 · **17:02** · Karim | S 17:28: 1 Harira · U: 1 Tajine poulet citron, note "No olives" · U: 1 Salade marocaine | **Ordering** · 230.00 |
| T9 | Dining room | 2 · 16:48 · Karim; bill asked at 17:30 | S 16:52: 1 Pastilla au poulet, 1 Zaalouk, 1 Cornes de gazelle | **Bill asked** · 188.00 |
| T12 | Dining room | 6 · 17:15 · Nadia | S 17:33: 2 Couscous royal, 2 Jus d'orange · S 17:38: 1 Cornes de gazelle, 1 Thé à la menthe | **In progress** · 419.00 |
| T22 | Terrace | 4 · 17:09 · Karim | S 17:21: 1 Tajine agneau pruneaux (note "Nut allergy: no almonds"), 1 Zaalouk, 2 Harira | **In progress** · 273.00 |
| T1, T3, T5 to T8, T10, T11, T20, T21, T23 | | No opening | | **Free** |


**Orders.** The day has 137; the fixture holds the 13 that any screen draws, each with its lines, every one on a table that exists or on Takeaway. The amount column is derived (Σ quantity × price), shown here for reading:

| Order | Table | Method | Time | Staff | Lines | Amount |
| --- | --- | --- | --- | --- | --- | --- |
| #1208 | Table 2 | Card | 17:36 | Karim | Tajine de légumes, Briouates aux crevettes, Thé à la menthe (T2's lines) | 156.00 |
| #1207 | Takeaway | Cash | 17:31 | Othmane | Harira, Cornes de gazelle, Thé à la menthe (ticket 41) | 84.00 |
| #1206 | Table 10 (now free) | Card | 17:24 | Nadia | Tajine agneau pruneaux, Jus d'orange, Baghrir | 212.00 |
| #1205 | Takeaway | Cash | 17:20 | Othmane | Soupe du jour, Bissara | 58.00 |
| #1204 | Table 8 (now free) | Card | 17:16 | Karim | Couscous tfaya, Baghrir, Thé à la menthe | 176.00 |
| #1203 | Takeaway | Cash | 17:14 | Othmane | Café noir, Baghrir | 37.00 |
| Refund of #1201 | Table 7 | Card | 17:12 | Karim | −1 Salade marocaine | −45.00 |
| #1202 | Table 5 (now free) | Card | 17:10 | Nadia | Couscous royal, Briouates aux crevettes, Harira | 247.00 |
| #1201 | Table 7 (now free) | Card | 17:08 | Karim | Salade marocaine, Zaalouk, Cornes de gazelle, Thé à la menthe | 132.00 |
| #1200 | Takeaway | Cash | 17:05 | Othmane | Bissara, Café noir, Thé à la menthe | 62.00 |
| #1199 | Table 11 (now free) | Card | 16:52 | Karim | Tanjia marrakchia, Couscous sept légumes, Taktouka | 318.00 |
| #1198 | Takeaway | Cash | 16:47 | Othmane | Baghrir, Thé à la menthe | 41.00 |
| #1197 | Table 3 (now free) | Card | 16:40 | Karim | Tajine poulet citron, Harira, Thé à la menthe | 204.00 |

So the 17:00 hour is complete (#1200 to #1208 and the refund), the numbers do not skip, and every time is before the clock. (#1203 is 37.00, not revision 5's 36.00, which no combination of menu prices makes.)

**Kitchen tickets** (stations: Hot, Cold, Pastry, Drinks; warning at 8 min, late at 15). Each ticket stores its own lines, the kitchen's record; the checks compare them with the table's lines sent at that time, or with the order's lines:

| Ticket | Lane | Source | Sent | Age at 17:39 | Lines (station) |
| --- | --- | --- | --- | --- | --- |
| 40 | Ready | Table 2 | 17:10 | | 1 Tajine de légumes (Hot), 1 Briouates aux crevettes (Hot), 1 Thé à la menthe (Drinks) |
| 41 | Ready | Takeaway (#1207) | 17:24 | | 1 Harira (Hot), 1 Cornes de gazelle (Pastry), 1 Thé à la menthe (Drinks) |
| 42 | Preparing | Table 22 | 17:21 | **18 min, Late** | 1 Tajine agneau pruneaux + note (Hot), 1 Zaalouk (Cold), 2 Harira (Hot) |
| 43 | Preparing | Glovo 3412 | 17:27 | 12 min, Warning | 1 Pastilla au poulet (Hot), 1 Thé à la menthe (Drinks) |
| 44 | Preparing | Table 4 | 17:28 | 11 min, Warning | 1 Harira (Hot) |
| 45 | Preparing | Table 12 | 17:33 | 6 min | 2 Couscous royal (Hot), 2 Jus d'orange (Drinks) |
| 46 | Preparing | Takeaway | 17:34 | 5 min | 1 Baghrir (Pastry), 1 Café noir (Drinks) |
| 47 | Preparing | Glovo 3415 | 17:35 | 4 min | 1 Tajine kefta aux œufs (Hot) |
| 48 | New | Glovo 3416 | 17:37 | 2 min | 1 Salade marocaine (Cold), 1 Harira (Hot) |
| 49 | New | Table 12 | 17:38 | 1 min | 1 Cornes de gazelle (Pastry), 1 Thé à la menthe (Drinks) |
| 50 | New | Takeaway | 17:39 | Just now | 1 Tajine poulet citron (Hot) |

**Open orders** (revision 8, F3): the five tickets that sit on no table and on no paid order are open orders, and the fixture now holds each one's record, so check 4 compares every ticket with a source the ticket does not own:

| Record | Source | Placed | Lines | Ticket |
| --- | --- | --- | --- | --- |
| G3412 | Glovo 3412 | 17:26 | 1 Pastilla au poulet, 1 Thé à la menthe | 43 |
| A1 | Takeaway, Othmane | 17:33 | 1 Baghrir, 1 Café noir | 46 |
| G3415 | Glovo 3415 | 17:34 | 1 Tajine kefta aux œufs | 47 |
| G3416 | Glovo 3416 | 17:36 | 1 Salade marocaine, 1 Harira | 48 |
| A2 | Takeaway, Othmane | 17:38 | 1 Tajine poulet citron | 50 |

Counted from the log over the 9 active tickets (New 3 + Preparing 6): Hot 7 (42, 43, 44, 45, 47, 48, 50), Cold 2 (42, 48), Pastry 2 (46, 49), Drinks 4 (43, 45, 46, 49). These are the values §18.7 draws.

**Customers (8 known; 7 can be contacted, Amine has no phone).** Each customer is a list of **dated visits** (date, amount). Visits = the list's length, lifetime spend = the sum of its amounts, last visit = its latest date. **Status is a true partition**, decided by the first rule that matches, on the store's business date (12 October 2026):
1. **New**: the first visit is 30 days ago or less (on or after 12 September);
2. **Inactive**: the last visit is more than 60 days ago (before 13 August);
3. **Regular**: everyone else.

New implies a visit in the last 30 days, so no customer can match both 1 and 2, and rule 3 takes the rest: every customer has exactly one status, with no gap and no overlap. (Revision 5's "3 visits in 60 days" counted a lifetime number and could not be checked.) **Returning today** = a visit today and at least two visits in all.

| Customer | City | Visits (first → last) | Count | Lifetime (sum) | Status (derived) |
| --- | --- | --- | --- | --- | --- |
| Salma Bennani (VIP) | Casablanca | 5 January → today | 41 | 11,780 MAD | Regular |
| Youssef Alaoui | Casablanca | 5 April → today | 22 | 6,420 MAD | Regular |
| Leila Fassi | Mohammedia | 3 October → today | 2 | 380 MAD (170 + 210) | New, and returning today |
| Omar Benjelloun | Casablanca | 5 May → yesterday | 15 | 4,150 MAD | Regular |
| Hind Berrada | Rabat | 14 June → 2 days ago | 9 | 3,960 MAD | Regular |
| Mehdi Chraibi | Casablanca | 6 October (6 days ago), once | 1 | 210 MAD | New |
| Sanae Idrissi | Rabat | 26 March → 30 July (74 days ago) | 6 | 1,240 MAD | Inactive |
| Amine Lahlou | Casablanca | 25 April → 13 July (91 days ago) | 4 | 860 MAD | Inactive |

The full dated lists are in `tools/fixtures/worked-example.json` and, identical, in the preview's embedded fixture. Regular 4 + New 2 + Inactive 2 = 8. Returning today: Salma, Youssef and Leila = **3 of 8**.

**Close state (23:41, §18.9), from the close's sources:**
- Z report number **0147**, closed by Othmane N. at **23:41**.
- Method tallies at close: card 104 orders, 17,115.00 gross, 45.00 refunded (#1201), so 17,070.00 net, tips 140.00; cash 79 orders, 8,360.00 gross, **120.00 refunded in cash** (rung after 17:39, so it is not in the day-so-far list; the day's only cash refund), so 8,240.00 net, tips 60.00. So 183 orders, **25,310.00 MAD** net of refunds, tips 200.00 (not revenue, §10.26).
- Cash session: opening float 500.00 (the same float as the previous opening, which is what `count.same_as_last` offers); cash sales 8,240.00, **already net of the 120.00 cash refund** (`day-report.js:717`); **cash tips 60.00**; cash movements in: 400.00 (change from the bank) and 320.00 (float top-up), out: 350.00 (vegetables supplier) and 250.00 (bread). **Expected = 500 + 8,240 + 60 + 720 − 600 = 8,920.00**, the shipped expression `opening + cashSales + cashTips + movesIn - movesOut` (`assets/day-report.js:719`), with no refunds term. Subtracting the 120.00 again would give 8,800.00, and check 11 fails on it (§17.5).
- Counted: 200 × 30, 100 × 20, 50 × 12, 20 × 12, 10 × 5, 5 × 2, 2 × 1 = **8,902.00**; difference **−18.00**, inside the ±20.00 default tolerance (§23.7).

**Cross-screen checks.** `fixture-agreement-test` runs them on the fixture and on every capture frame; the preview runs **the same checks, with the same numbers and names** (seventeen until revision 22; revision 23 retires check 6 with the floor's frame, so sixteen ran; revision 24 adds 18 and 19, so eighteen ran; revision 25 adds 20, so nineteen run; revision 8 adds 12 to 15 and widens 1 and 4; revision 9 adds 16 and widens 1, 14 and 15; revision 10 adds 17, widens 14 and 15, and makes every comparison exact to the code point; revision 11 widens 1, 15 and 17), on its embedded fixture and the text of **every** frame template it draws (light and dark share one template, so one text), including Home on the SE (`home-se`) and Home in Arabic (`home-ar`), which revision 6 left out of its frame list (revision 7, M5); **revision 12, P5: the page now draws `home-ar` in light as well as dark**, so every Home frame is shown in light. The preview has no contrast check of its own: contrast is a property of the tokens, computed for both themes in §5.3 and held by `token-contrast-test`, and the frames use only those tokens. The page prints the checks' result at the top. In each, **the expected value comes from a source and the actual value is what a frame draws**, and the two are never the same field. **Every check fails when a reference does not resolve** (an order's table, a ticket's table, order or dish, a line's dish): a missing reference is a failure, never a skip.

| # | Check | Drawn (read from the frame's text) | Expected, from which source |
| --- | --- | --- | --- |
| 1 | Revenue, dates and times | **Revision 9 first: every row of §6.3's test-vector table through the page's `KiwiFormat`, and no U+200E, U+200F, U+061C or U+202F anywhere in a Home frame's text. Revision 10: every comparison is exact to the code point, so the U+00A0 between each number and its unit is checked too. Revision 11, M5: every delta, the tiles' included, is built with `KiwiFormat.signed`, so an unsigned "↑ 4" fails. Revision 12, M4: the Kiwi AI card's delta, which sits inside a sentence, is built unsigned with the word its sign selects ("less"), so a signed "−1,127 MAD less" fails. Revision 16, M2: every arrow is read from the symbol its `<use>` draws, not from its label, and is painted in its polarity's colour (§10.21) in the light and the dark theme: its computed colour and its glyph's fill must equal an element carrying the polarity class, put beside it in the attached frame. Revision 17, M4: "the symbol it draws" is identified by its path data (check 13), the fill is read on the `<use>` as well as on its `svg`, and **each change's own text** (the compare delta and the three tile deltas) must have that same computed colour, so a change keeping its danger class while painted accent inline fails. Revision 15, P9: the units of the key figure and of the basket tile, which are their own spans, must each be U+00A0 then the frame's unit (MAD, or درهم in Arabic), so EUR, دولار or a plain space fails; the Arabic key figure now uses the same U+00A0 construction as the English one, with no flex gap.** Then on **every** Home frame (6.9, SE, Arabic): the key figure, the tiles and the deltas; Orders' key figure and summary; the Kiwi AI card; **the polarity class of each delta** (danger, accent-ink or ink-2); **revision 8: the date button ("Today · Monday 12 October", and the Arabic "اليوم · الاثنين 12 أكتوبر"), the compare baseline ("vs yesterday at 17:39"), the legend's two labels, the Kiwi AI card's stamp ("Today at 17:39"), Orders' date and every status bar's clock** | The method tallies: revenue = Σ (gross − refunds), orders = Σ orders, share = card net / revenue; deltas from the yesterday record; the class from the key's polarity (§10.21: revenue and orders up is good, card share neutral) and the delta's sign; **every date from `date` and every time from `now`**, through `KiwiFormat` (§6.3, revision 9), never a typed string or a hand-built month list |
| 2 | Latest orders | Each row on Home's Latest orders (6.9 and Arabic) and in Orders: number, table, method, time, staff, amount; the rows' order; **the Orders list's length**; the "See all" count | The order log: amount = Σ the order's lines × menu price; table, method, time and staff from the log entry; time ≤ the clock; rows newest first; the order's table is on the plan and its derived status is Paid or Free; a Paid table's paying order has exactly that table's lines. **Orders draws every logged order of the hour, refunds marked, in log order newest first**, so a dropped or swapped row fails |
| 3 | Elapsed time | The bill header's "open since" (revision 23: the floor's line 1 went with the floor's frame) | The clock minus the table's opening time; for Paid, the time of the order in the log that settles the table |
| 4 | Kitchen tickets | The ticket's source, lines, age and state as §18.7 draws them (`drawnElsewhere.kds` plus the log), **for all eleven tickets** | The ticket log against the table's lines **sent at the ticket's time**, or the order's lines (ticket 41: #1207), or, for a ticket on no table and no paid order, **its open order's record** (the table above: source, lines, and placed no later than sent); age = clock − sent; state from the 8 and 15 minute thresholds. Revision 7 could only check that tickets 43, 46, 47, 48 and 50 named a plausible source |
| 5 | Kitchen counts | The rail's Kitchen badge (drawn on the till frames); the header's All, New, Preparing and station counts (`drawnElsewhere.kds`) | Counted from the ticket log by lane, and by each dish's station in the menu; **the badge equals the New count** (§10.13, M8) |
| 6 | Occupancy | **Retired in revision 23**: it compared the floor's frame, which the direction no longer draws (§18.4). The number is kept so every other check and row keeps its own | none |
| 7 | Menu | Every till tile's name and price, every bill line's quantity, name and amount | The menu: the dish exists and price = menu price; line amount = quantity × menu price |
| 8 | Returning | Home's Returning value and "of 8 customers" | Customers with a dated visit today and at least two visits; the number of customer records |
| 9 | Statuses (revision 10: "last visit" through `KiwiFormat.rel`, §6.3) | Customers' segment counts (All, Regular, VIP, New, Inactive; VIP since revision 23, P2) and each row's status, last visit and lifetime; **the rows' order** | The partition above, computed from each customer's dated visits and the business date; VIP from the records' `vip` flag, outside the partition's sum; last visit and lifetime from the visit list; rows sorted by last visit, newest first, then lifetime spend, highest first |
| 10 | Bill | **Each bill line** (quantity, name, note, amount), in order, unsent first then sent; **each line's group, read from its drawn position** (revision 14, P4): walking the bill from the top, each line sits under the nearest header above it; each sent group's header time; the bill meta (guests, staff, opened); the bill's total, "Not sent · 2", the primary's count | The table's record line by line: name and note from the record, amount = quantity × menu price, unsent lines first, then each send in time order with its time; meta from the table's guests, staff and opening; total = Σ lines; the count of unsent lines. So a bill that redraws a line and still shows 230.00 fails |
| 11 | Close | The Z's expected, counted, difference, total, method lines, tips and the cash refunds sub-line (`drawnElsewhere.close`) | The close tallies (gross and refunds per method), the cash movements, the float and cash tips, through the shipped expression `opening + cashSales + cashTips + movesIn - movesOut` with `cashSales` = cash gross − cash refunds, and the denominations. **Revision 7:** the fixture holds a 120.00 cash refund, so a frame that subtracts refunds a second time (8,800.00) fails; mutations 36 and 41 are those frames |
| 12 | Rail and hours (revision 8) | The rail's avatar initials and cashier name on the till frame; Orders' hour headers and which rows sit under each | The till's signed-in cashier (`till.cashier`) through the staff list; one header per hour of the order log, newest first, and every row in a group from that hour |
| 13 | Marks (revision 8) | **Revision 16 (M2) first:** every icon of every frame (132 then; 114 in revision 22; 104 once revision 23 drew no floor frame, and 109 since revision 23 draws the mic, the Action Center, the calculator, the attach button and the Customers overflow) draws the symbol its `data-i` label names. Revision 17 (M4): "draws" means the drawing. The symbol its `<use>` references is identified by its path data: the symbol may carry only `id` and `viewBox`, each child must be a `<path>` with only a `d`, and the viewBox and every `d`, hashed, must equal the hash of `assets/icons/material/<name>.svg`, which a script generated from the vendored files and which the kit self-test re-reads from them when the page is served (38 files since revision 23 adds `mic`, `pending_actions` and `upload`; the self-test shows Pass only when every one of them is read and matches, Not run when any file cannot be read, and Fail when one differs; the self-test box goes green only on Pass, and says "not complete" on Not run). Then, in the attached frame and in both themes, every icon is painted as a reader sees it: from its `<use>` up to the frame root, no element is `display:none`, every one is `visibility: visible` with an opacity above 0 and no `scale` or `rotate`, and none has a transform, except §9.5's `scaleX(-1)` on the icon itself when it is `.mir` and its glyph may mirror; the `<use>` and its `svg` carry no `transform` attribute; the computed fill of the `<use>` and of its `svg` is the icon's own colour, which is not transparent, with a fill-opacity above 0; and its box has an area. Revision 18 (M1) adds, and says exactly what is read, because this is not a pixel test: on the same chain, `clip-path`, `mask`, `filter` and `mix-blend-mode` must be unset and `content-visibility` must not be `hidden`; on the sprite path itself (a rule on it is copied into every use), `display: none`, hiding, a zero opacity or fill-opacity, a fill or stroke other than the sprite's, a transform and those paint effects are refused; the icon's box must lie inside every box that clips it, the frame included, except that an icon in a scroll region may run past its bottom edge (content the reader scrolls to); its colour must stand at least 3:1 against the first opaque background behind it, semi-transparent layers composited (WCAG 1.4.11); and, with the frame on screen in the same task (so nothing is painted), the browser's hit test at the icon's centre must find the icon, its `svg`, its `<use>` or one of its ancestors (revision 20, M3: any other element inside the icon counts as a covering), and so must it at three of four points inset from its corners, of those the reader can see. Two coverings are allowed by design and named: page content passing under the floating tab bar (§18.11's second tile row), and the page behind an open sheet's scrim, whose icons are not hit-tested. Revision 19 (M5) adds: the `<use>` spans the whole box (no `x` or `y`, `width` and `height` 100 %) and the `svg` carries no `viewBox`; the drawn glyph (the `<use>`'s rendered box) has an area and lies inside the `svg`'s box, to 1 px; the `<use>` and the `svg` are stroked with nothing, and the sprite path's stroke is the sprite's; the icon, its `svg` and its `<use>` carry no `box-shadow` and no `background-image`, and no ancestor an inset shadow or a background image; the legacy `clip` is unset and no outline is drawn inward on the chain; the pseudo-elements and the stacking of revision 21's list below; and check 1 reads a change's `-webkit-text-fill-color` as well as its `color`. **Revision 21 (F1): what the check reads, as a closed list. It reads exactly these, and nothing else.** (1) **The symbol:** the `<use>`'s `href`; the referenced symbol's attributes and children and each path's `d`, hashed. (2) **Placement:** the `transform` attribute of the `<use>` and the `svg`; the `<use>`'s `x`, `y`, `width` and `height` attributes and computed `x` and `y`; the `svg`'s `viewBox` and `preserveAspectRatio` attributes. (3) **The chain**, each element from the `<use>` up to the frame root: `display`, `visibility`, `opacity`, `scale`, `rotate`, `transform` (with the icon's `.mir` class and label, for §9.5's mirror), `clip-path`, `mask`, `mask-image`, `filter`, `mix-blend-mode`, `content-visibility`, `clip`, `outline-style`, `outline-width` and `outline-offset`; `stroke` on the `<use>` and the `svg`; `box-shadow` and `background-image` on the `<use>`, the `svg` and the icon; an inset `box-shadow` and `background-image` on each ancestor. (4) **The sprite path:** `display`, `visibility`, `opacity`, `fill-opacity`, `fill`, `stroke` (against the sprite's own), `transform` and item 3's paint effects. (5) **Fill:** the icon's `color`; the `fill` and `fill-opacity` of the `<use>` and the `svg`. (6) **Geometry:** the `svg`'s box and the `<use>`'s rendered box; each ancestor's `overflow-x`, `overflow-y` and `contain`, and the box of each one that clips; whether the icon is inside a `.clip` scroll region. (7) **Contrast:** the `background-color` of the icon and of each ancestor, composited up to the first opaque one. (8) **Stacking (revision 21):** for each element from the `svg` up whose `z-index` is negative and applies (it is positioned, or its parent's `display` is flex or grid), the `background-color` and `background-image` of every ancestor between it and its stacking context's root. The root is the nearest ancestor with any of: a `z-index` other than auto while positioned or a flex or grid item; `position` fixed or sticky; `opacity` below 1; `isolation: isolate`; a `mix-blend-mode`; a `transform`, `translate`, `rotate`, `scale` or `perspective`; a `filter`, `backdrop-filter`, `clip-path` or mask; `contain` layout, paint, strict or content; a `container-type` other than normal; a `will-change` naming `opacity`, `isolation`, `mix-blend-mode`, `z-index`, `transform`, `translate`, `rotate`, `scale`, `perspective`, `filter`, `backdrop-filter`, `clip-path` or a mask. A background there is painted over the element, so it fails. (9) **Pseudo-elements (revision 21):** every `::before` and `::after` of the icon and of each ancestor whose `content` is not none or normal, whose `display` is not none, whose `position` is absolute or fixed, whose `z-index` is not negative, and that paints (`background-color` with alpha above 0, `background-image`, `box-shadow`, a border side with width and colour, or quoted `content`). Its box is placed from its containing block: the nearest of the originating element and its ancestors with a `position` other than static (not for a fixed box), a `transform`, `translate`, `rotate`, `scale`, `perspective`, `filter`, `backdrop-filter`, `transform-style: preserve-3d`, a `will-change` naming `transform`, `translate`, `rotate`, `scale`, `perspective`, `filter` or `backdrop-filter`, `contain` layout, paint, strict or content, a `container-type` other than normal, or `content-visibility: auto`; else the viewport (fixed) or the root. From that block's padding edge, its `left`, `top`, `margin-left` and `margin-top`, and its `width` and `height` (with padding and borders unless `box-sizing` is border-box), scaled as the frame is drawn. The boxes are summed: 25 points spread evenly over the `svg`'s box (a 5 × 5 grid whose middle point is the centre) are tested against all of them together, and the centre covered, or 7 points or more, fails. (10) **Hit test:** `elementFromPoint` at the centre and at four points inset 20 % from the corners, of those inside every clipping box; the topmost hit must be the icon, its `svg`, its `<use>` or an ancestor; the centre may not be covered, one corner may; a hit inside `.capsule` over an icon outside it, and every icon before an open sheet's `.scrim`, are not tested. (11) **Check 1's polarity read:** the arrow's classes, `color` and `fill`, its `<use>`'s `fill`, and the change text's `color` and `-webkit-text-fill-color`. **Not read, by construction:** anything outside items 1 to 11, which includes any paint not modelled above: paint inside a shadow root, a canvas or an image; a glyph a font would draw; anti-aliasing and compositing by the GPU; an opacity, a fill-opacity or a size above zero but too small to see (only the colour's own alpha enters the contrast read); a CSS `d`; a pseudo-element that is not positioned, has a negative `z-index`, or is moved by its own transform; a pseudo-element's `right` and `bottom`; paint outside an element's own box (an outline, an outer `box-shadow`); and an element or pseudo-element kept out of the hit test. **What this proves, and no more:** each value named, on each element named, is read and refused as stated. Nothing outside the list is claimed. The reads below take the glyph. The VIP star on each customer row; **each Orders row's leading method icon** (revision 14, P4); each till tile's in-bill badge and its options mark (`tune`) | The customer record's `vip`; the order's `method` or `refund` in the log: `credit_card`, `payments`, `sync_alt` or `undo` (§18.2); the bill table's (`till.billTable`) quantity of that dish, and the menu's options flag |
| 14 | Chart (revision 8; widened in revision 9) | On every Home frame (6.9, SE, Arabic): every point of both lines, the top gridline's position and its label; **revision 9: today's line at its last point, yesterday's line at the clock's x, the now-dot's x and y, each step gridline's y and its label's text and y, and the four axis labels' text and x** | No point above the band's lower edge (26 at factor 1); the top gridline on that edge; the larger series ends on it; the label is the larger of yesterday's whole day and today so far through `KiwiFormat.compact` ("30.1K", AR "30,1 ألف"). **Revision 9, through the plot scale y(v) = bottom − v ÷ max × (bottom − 26), with the frame's plot bottom (140 on the 6.9, 100 on the SE) and x(t) = (t − cutoff) ÷ 24 h × width (mirrored in AR):** today starts at (x(cutoff), y(0)) and ends at x(`now`) and y(tallies' revenue, 19,174); yesterday ends at x(cutoff + 24 h) (revision 10, P1); yesterday at x(`now`) is y(`yesterday.revenue`, 20,301); the now-dot is (x(`now`), y(19,174)); the steps are the round steps of §10.22 (10K and 20K), at y(v), labelled `KiwiFormat.compact(v)` 4.5 above; the axis labels are the cutoff and every 6 h after it (05:00, 11:00, 17:00, 23:00) at quarter widths. Each within 0.5 px |
| 15 | Paid line, sync rows and the store lock (revision 8; widened in revisions 9 to 13; revision 21: the lock as shipped in `762bb255`) | For eleven recorded sales: what the paid moment writes under the amount (`drawnElsewhere.paidLine`), the sync rows (`drawnElsewhere.indicator`), the banner (`drawnElsewhere.banner`) and whether the store lock shows (`drawnElsewhere.lock`): online and queued, offline, refused, storage full, Live Link off, no store yet, autosave failed with the outbox queued, other store, other store with storage full, the receipt-return path, and unpaired with a service open. Which journal entries the heartbeat replays (`drawnElsewhere.replayed`) and what shows each held entry (`drawnElsewhere.heldShownBy`), for four entries. Which screen each of six tills shows (`drawnElsewhere.lockScreen`): a service open and the till re-paired, a service open and the till unpaired, an idle till re-paired, an idle till unpaired, a till paired back with its service's store, and a service with no store. What each of six codes entered on the pad the lock opens leads to (`drawnElsewhere.lockAttempt`): the held store's code with its staff list loaded, unavailable, or empty by the store's choice; the paired store's code; a third store's code; and the held store's code with no answer | **One predicate, §10.26's, for every case below:** `KiwiTillTenant.mismatch()` as shipped, a service open, of a store, that is not the paired store. `paidCases` through §10.26 item 3, each with its stores (`merchant`, the service's; `paired`, `currentMerchantSlug()`; `liveMerchant`, `KiwiLive.merchant()`): the lock from the predicate, and the merchant guard from those stores, with a non-empty merchant required; `tillSave`'s `'other-store'` exactly when the service's store is not the paired one; a held sale never reaches `postSale`, so its outbox input must be `none`; `postSale`'s `undefined` split into off and not applicable; `{ok:false}` refused; the receipt-return path as its own branch, never `sync.saved_here`; rows sorted by their §10.26 number, every applicable row listed and none folded; one banner, the first of rows 1 and 2, none under the lock. `replayCases`: replayed only when pending and the guard allows it; every held entry shown by the lock or by row 5. `lockCases`: the predicate on each till's `open`, `service` and `paired` gives the lock; with no lock, the paired store's staff pad, or the pairing pad when unpaired. `lockAttempts`, from each code's store, the connection and the staff list: no answer; another store's code, which sets the service aside (the page restarts as that store's till); or the held store's code, after which the predicate no longer holds and the store's staff gate follows: the staff pad when the list loads, and the till when the store has no staff codes by choice or when the list cannot load (§10.2's staff-list row, because the switch deleted the till's verifier rows for that store) |
| 16 | Bell, source and actions (revision 9; revision 23 adds the Action Center; revision 25 the Takeaway badge) | The bell's badge on every Home frame; the Kiwi AI card's source chip; **the Action Center's badge on the Kiwi AI frame**; **the till rail's Takeaway badge** | The count of unread entries in `notifications`; the chip names the records the card's figures came from, `ai.source.sales_today` "Sales · today", the tallies of the fixture's `date`; the count of `aiActions` entries whose status is `pending` (2); the count of `onlineOrders` that are pending and placed no later than the clock (1) |
| 17 | Names and places (revision 10, P1; revision 11, P11) | The venue on every Home frame and twice in Kiwi AI; the till's category tabs and the menu grid's headers; **the till's dish tiles in reading order (revision 11)**; each customer row's avatar initials (the weekday in the Kiwi AI suggestion until revision 25) | `venue`; the menu's categories in order; **the menu's dishes in order**; the first letters of the customer's first and last name |
| 18 | Daily goal (revision 24, M2; revision 25, P6) | Every Home frame's goal line ("82% of the 23,500 MAD goal", and its AR form) and its mark **as painted**, in light and dark on the attached frame: the mark, its fill and the line are shown (no `display: none`, visibility visible, opacity above 0, up to the frame); the track's box is 96 × 4; the fill's box is the share of the track's width, the track's height, from the track's start edge (its right edge in Arabic, §9.5); the fill's computed colour is accent-ink and the track's `--k-line`, so the two differ; the line lies between the key figure and the compare control | The day's revenue (check 1's tallies) over the fixture's `goal`, through `KiwiFormat.share`, and the goal through `num` with its unit; the fill is that share of the track's measured width, never more than the whole track, to 0.5 px; the colours are read from probes painted with the tokens in the same frame and theme |
| 19 | Controls present (revision 24, P7) | Every frame's icons, by name and count, read from each `.ms` element's `data-i` | The set each frame is written with (`PRESENT` in the preview; `tools/fixtures/presence.json` at stage 1): Kiwi AI draws `battery_5_bar`, `expand_more`, `pending_actions`, `close`, `chevron_right`, `dialpad`, `upload`, `mic` and `send` once each; the other six frames' sets are the preview's, 100 icons over them, and the shop frame draws Kiwi AI's set without `chevron_right`, since it has no Today card (revision 25). Check 13 then holds that each one present is painted and draws its own symbol. **Labels (revision 25, P13):** each labelled control's label is present once, with its key's text: `nav.ai` "Kiwi AI" on every Home frame, and `ai.actions.button` "Actions", `ai.calculator` "Calculator" and `ai.attach` "Attach" on both Kiwi AI frames (`LABELS` in the preview) |
| 20 | Trade suggestions (revision 25, M1) | Both Kiwi AI frames' suggestion rows, in order; the shop frame's venue, twice; whether it draws the Today card and the Action Center's badge | Rows 1 to 3: the store's trade's questions (`SUGGEST`, the shipped `aiChips`, §9.6 `ai.suggest.*`); rows 4 and 5 when its costs are set up, the two simulators ("Can I hire a waiter?", and the price question with 5% through `KiwiFormat.share`); otherwise the two new-store questions and row 6, the trade family's operational question; `aiShop.venue`; a Today card only when `aiShop.salesToday` is above 0; a badge only when `aiShop.pendingActions` is above 0, drawing that count |

**Mutation table (each check must go red).** The preview runs every row below on a copy of its fixture and of its light frames when it loads, and prints "n of n mutations caught"; `fixture-agreement-test` runs the same list. A row passes only if the named check fails on the mutated copy (others may fail too), so a check that compares a value with itself cannot pass this table. The five rows from the round 6 critique that wrongly passed revision 5 are marked R; the seventeen added for the round 7 critique (M1, M5, M8) are marked S, and the seventeen added for the round 8 critique (F1, F3, F4) are marked T; rows 42 to 49 are the round 8 critic's eight mutations that stayed green against revision 7. **Revision 23 keeps the floor as shipped (owner, 2026-10-13; §18.4), so no frame draws it. Fourteen rows that broke the floor's frame, or fixture data only the floor drew, are retired and keep their numbers: 4, 15, 19, 20, 21, 33, 34, 92, 107 and 184 to 188 (revision 22's AH rows). Rows 48, 137, 152, 158, 163 and 165, which test check 13's reading of an icon, move from Floor's T4 to Orders' #1208 leading icon, and rows 1 and 16 drop the floor's half of their targets. Revision 23 also adds rows 189 to 192, marked AI, for the round 23 critique (M1, P2): the Action Center's badge from its queue (data and frame), the composer's mic redrawn, and the VIP segment's count. Revision 24 adds rows 193 to 200: 193 to 196, marked P, remove the mic, the Action Center, Calculator and Attach from the Kiwi AI frame (round 24, P7: each stayed green against revision 23); 197 to 200, marked G, break the goal line in the data, the fill, a missing line on the SE and an ordinary space in Arabic (M2). The preview runs 186 rows and lists the retired ones.** **Revision 16 adds 134 to 142, marked AB, for the round 16 critique (M2): each redraws a glyph through its `<use>` or repaints an arrow, and none touches a `data-i` label; rows 48, 119 and 120, which changed only the label, now redraw the glyph too. A sweep that points each of the 132 icons at another symbol, one at a time, turns a check red 132 times out of 132.** **Revision 15 added 125 to 133, marked AA, for the round 15 critique (M1, P9): four that change a unit on Home, and five that break the roster step's one definition, its in-flight line and its classification of a timeout and of a body that is not JSON; revision 21 rewrote those five, and 106, 112, 113, 115, 116 and 121 to 123, for the lock `762bb255` ships.** **Revision 14 added 118 to 124, marked Z, for the round 14 critique (M1, P3, P4), and rewrites 101 with the current rows (P5). The preview's `__kiwiPreview.why(n)` returns the reason each target check gives, so a reviewer can confirm that a row fails for the reason it names.** **Revision 13 added 114 to 117, marked Y, for the round 13 critique (B1, P3, P4), and rewrote 111 to 113 so that they break a source-derived answer, not a fixed string (P5).** **Revision 12 added 110 to 113, marked X, for the round 12 critique (M3, M4, P8).** **Revision 11 added 100 to 109, marked W, for the round 11 critique (M1, M4, M5, P2, P3, P4, P11), and rewrites 86, 87 and 89 for the store lock.** **Revision 10 added 80 to 99, marked V, for the round 10 critique (M1, M3, M5, M6, P1, P2).** **Revision 9 added 59 to 79, marked U, for the round 9 critique (M1, M2, M3, M5, P6):** rows 59 to 67 are the round 9 critic's seven mutations that stayed green against revision 8 (its third, "the same on the SE and the AR frame", is two rows, 61 and 62, and its fifth is two, 64 and 65).

| # | Mutation | Kind | Must fail |
| --- | --- | --- | --- |
| 1 | R · T2 gains a line (1 Café noir), so #1208 no longer equals its lines (revision 23: check 10 no longer reads the floor's tile totals, so it targets 2 alone) | data | 2 |
| 2 | R · Hind's visits become two, on 20 September and 10 October (her first visit is now 22 days ago, so she is New) | data | 9 |
| 3 | R · #1206's Baghrir becomes Café noir (its amount is now 205) | data | 2 |
| 4 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: R · T9 gains a line (1 Harira) | data | none |
| 5 | R · #1207's time becomes 17:50, after the clock | data | 2 |
| 6 | #1206 moves to T15, which is not on the plan | data | 2 |
| 7 | Ticket 44 holds 2 Harira | data | 4 |
| 8 | The card tally says 999 orders | data | 1 |
| 9 | Leila's 3 October visit is removed (one visit) | data | 8 |
| 10 | Salma's last visit is yesterday | data | 8 |
| 11 | A 999.00 cash-in movement is added at the close | data | 11 |
| 12 | Ticket 40 is on T99 | data | 4 |
| 13 | Harira costs 36.00 on the menu | data | 7 |
| 14 | Ticket 45 moves to Ready | data | 5 |
| 15 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: T7 opens at 17:37 with no lines (it becomes Open) | data | none |
| 16 | The clock is 17:45 (revision 23: check 3 no longer reads the floor's elapsed times; the tickets' ages catch it) | data | 4 |
| 17 | Home's key figure is drawn "19,175" | frame | 1 |
| 18 | Home's #1206 row draws "999 MAD" | frame | 2 |
| 19 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: Floor's T4 draws "36 min" | frame | none |
| 20 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: Floor's T2 draws "Paid 17:35" | frame | none |
| 21 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: Floor's header draws "6 of 16" | frame | none |
| 22 | The till's Harira tile draws "36.00 MAD" | frame | 7 |
| 23 | The bill draws "Not sent · 3" | frame | 10 |
| 24 | Customers' segment draws "New 3" | frame | 9 |
| 25 | S · The bill draws Harira as 2× at 70.00 (consistent with itself, not with T4) | frame | 10 |
| 26 | S · The bill draws Soupe du jour 30.00 in place of Harira | frame | 10 |
| 27 | S · Orders drops the #1203 row | frame | 2 |
| 28 | S · Orders swaps the #1205 and #1204 rows | frame | 2 |
| 29 | S · Home on the SE draws the key figure "19,175" | frame | 1 |
| 30 | S · Home in Arabic draws the orders tile "138" | frame | 1 |
| 31 | S · Home in Arabic draws returning "4" | frame | 8 |
| 32 | S · The bill meta draws "4 guests" | frame | 10 |
| 33 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: S · Floor's T22 waiter badge draws "NA" | frame | none |
| 34 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: S · Floor's T5 draws 4 seat ticks for its 6 seats (revision 22; it drew "4 seats" before) | frame | none |
| 35 | S · Customers swaps the Omar and Hind rows | frame | 9 |
| 36 | S · The close draws expected 8,800.00 (cash refunds taken off a net figure a second time) | data | 11 |
| 37 | S · The rail badge draws 9 (every active ticket, not New) | frame | 5 |
| 38 | S · Home paints the revenue fall in accent | frame | 1 |
| 39 | S · Home in Arabic draws #1208 at 157 | frame | 2 |
| 40 | S · The bill's sent header draws "Sent 17:27" | frame | 10 |
| 41 | S · The close's cash refund is 0 with the gross unchanged | data | 11 |
| 42 | T · Home's date draws "Today · Monday 13 October" | frame | 1 |
| 43 | T · The compare baseline draws "vs yesterday at 17:38" | frame | 1 |
| 44 | T · The legend draws "Yesterday at 16:39" | frame | 1 |
| 45 | T · The Kiwi AI card is stamped "Today at 18:39" | frame | 1 |
| 46 | T · The rail's cashier draws Karim | frame | 12 |
| 47 | T · Orders' 16:00 header draws 15:00 | frame | 12 |
| 48 | T · Orders' #1208 leading icon draws `check_circle` (revision 23: moved from Floor's T4) | frame | 13 |
| 49 | T · Salma's VIP star is removed | frame | 13 |
| 50 | T · The Harira tile's badge draws 2 | frame | 13 |
| 51 | T · Tajine poulet citron loses its options mark | frame | 13 |
| 52 | T · Glovo 3412's open order holds a Harira its ticket lacks | data | 4 |
| 53 | T · The chart's top gridline is labelled "30K" | frame | 14 |
| 54 | T · The SE chart's scale lets the baseline into the band | frame | 14 |
| 55 | T · The storage-full paid moment draws "Saved on this till" | data | 15 |
| 56 | T · The storage-full sale's autosave is recorded as written (`tillSave` true) | data | 15 |
| 57 | T · The status bar draws 17:40 | frame | 1 |
| 58 | T · Home in Arabic draws the 13th | frame | 1 |
| 59 | U · Today's line ends at source y 90, about 13,000 MAD under a key figure of 19,174 | frame | 14 |
| 60 | U · Yesterday's 17:39 point drawn at about 11,000 instead of 20,301 | frame | 14 |
| 61 | U · The same on the SE: today's line ends at about 13,000 | frame | 14 |
| 62 | U · The same in Arabic: yesterday at 17:39 drawn at about 11,000 | frame | 14 |
| 63 | U · The now-dot at x 260, about 18:40 | frame | 14 |
| 64 | U · The "20K" gridline relabelled "25K" | frame | 14 |
| 65 | U · The "17:00" axis label drawn "18:00" | frame | 14 |
| 66 | U · The bell's badge draws 9 on every Home frame | frame | 16 |
| 67 | U · The Kiwi AI source chip draws "Sales · yesterday" | frame | 16 |
| 68 | U · The business day starts at 06:00 (cutoff 6), so the clock's x and the axis labels move | data | 14 |
| 69 | U · The late-ticket notification is read (2 unread) | data | 16 |
| 70 | U · The SE's 10K gridline drawn at 15K | frame | 14 |
| 71 | U · Home in Arabic's delta carries a U+200E from `Intl` | frame | 1 |
| 72 | U · Home in Arabic groups the key figure with U+202F | frame | 1 |
| 73 | U · The Live Link off till draws "not sent" | data | 15 |
| 74 | U · The Live Link off sale is recorded as Live Link on | data | 15 |
| 75 | U · The no-tenant sale is drawn as not applicable (nothing under the amount, no indicator) | data | 15 |
| 76 | U · A failed autosave with the outbox queued draws no banner | data | 15 |
| 77 | U · The merchant-mismatch autosave is recorded as written | data | 15 |
| 78 | U · The receipt-return path draws "Recorded on this screen only" while the till's autosave lands | data | 15 |
| 79 | U · The receipt-return path on a till whose autosave is failing (it must say screen only) | data | 15 |
| 80 | V · Every U+00A0 in the Home frames becomes U+0020 (the round 10 critic's M1) | frame | 1 |
| 81 | V · Orders' key figure draws an ordinary space before MAD | frame | 1 |
| 82 | V · The bill total draws an ordinary space before MAD | frame | 10 |
| 83 | V · The receipt-return path, offline, draws "Saved on this till" (M6) | data | 15 |
| 84 | V · The receipt-return path is given an outbox answer | data | 15 |
| 85 | V · The other-store sale reaches the outbox | data | 15 |
| 86 | V · Other store with storage full draws the storage banner over the store lock (revision 11) | data | 15 |
| 87 | V · Other store with storage full folds its storage row away (revision 11) | data | 15 |
| 88 | V · The heartbeat replays a sale made before the re-pair (M3) | data | 15 |
| 89 | V · The heartbeat replays an entry before `KiwiLive.merchant()` resolves (revision 11; revision 10's case was an impossible state, P2) | data | 15 |
| 90 | V · Home names the venue "Café Atlas 2" (P1) | frame | 17 |
| 91 | V · Kiwi AI names another venue in its body | frame | 17 |
| 92 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: V · The Terrace zone drawn "Patio" | frame | none |
| 93 | V · The till's first two category tabs swapped | frame | 17 |
| 94 | V · The sticky category header drawn "Mains" | frame | 17 |
| 95 | **Retired in revision 25** (rows 1 to 3 name no weekday; check 20 holds them); it was: V · The Kiwi AI suggestion says "last Sunday" | frame | none |
| 96 | V · Today's first point moved to about 2,000 MAD | frame | 14 |
| 97 | V · Yesterday's last point at x 300 (23:00), its y unchanged | frame | 14 |
| 98 | V · Customers draws ICU's "the day before yesterday" wording for a visit 2 days ago (P2) | frame | 9 |
| 99 | V · Salma Bennani's avatar draws "SA" | frame | 17 |
| 100 | W · Storage full draws revision 10's order, `not_synced` before `storage_error` (M4) | data | 15 |
| 101 | W · Storage full draws its three current rows in revision 10's reversed order, `not_synced`, `not_saved`, `storage_error` (M4; rewritten in revision 14, P5: it named `not_saved_store`, which is no longer a row, so it went red for that and not for the order) | data | 15 |
| 102 | W · The re-paired till draws no store lock (M1) | data | 15 |
| 103 | W · Revision 10's older-store entry comes back, held and shown by nothing (P2) | data | 15 |
| 104 | W · Home's Orders tile draws its change unsigned, "↑ 4" (M5) | frame | 1 |
| 105 | W · The Arabic basket tile draws its change unsigned (M5) | frame | 1 |
| 106 | W · The unpaired till with a service open draws no store lock (P4; revision 21: one lock screen for both cases) | data | 15 |
| 107 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: W · Tables T4 and T22 swap places, T4 drawn on the Terrace (P11) | frame | none |
| 108 | W · The Harira and Tajine de poisson tiles swap places (P11) | frame | 17 |
| 109 | W · An entry with no merchant is replayed, because `''` equals `''` (P3) | data | 15 |
| 110 | X · The Kiwi AI card signs the delta inside its sentence, "−1,127 MAD less" (M4) | frame | 1 |
| 111 | X · An idle till re-paired to another store is drawn behind the store lock (revision 13, B1) | data | 15 |
| 112 | X · The store's own code on the pad opens the till, skipping the staff pad (revision 13: from sources) | data | 15 |
| 113 | X · A third store's code on the pad reaches the held store's staff pad (revision 21: it sets the service aside) | data | 15 |
| 114 | Y · An idle till that is unpaired is drawn behind the store lock (B1) | data | 15 |
| 115 | Y · The store's own code, its staff list unavailable, is drawn on a staff pad that has no list (revision 21) | data | 15 |
| 116 | Y · Offline, the pad treats the store's own code as another store's (P3; revision 21) | data | 15 |
| 117 | Y · The idle till is recorded with a service open, and its screen is not redrawn (B1) | data | 15 |
| 118 | Z · Harira (sent at 17:28) is drawn in Salade marocaine's place, under "Not sent" (P4) | frame | 10 |
| 119 | Z · Orders draws #1208, a card sale, with the cash icon (P4) | frame | 13 |
| 120 | Z · Orders draws #1207, a cash sale, with the card icon (P4) | frame | 13 |
| 121 | Z · A till paired back with its service's store is still drawn behind the lock (revision 21) | data | 15 |
| 122 | Z · After the store's own code, a staff list that cannot load sends the cashier back to the pairing pad (revision 21) | data | 15 |
| 123 | Z · The paired store's code is drawn as refused, which the shipped pad does not do (revision 21) | data | 15 |
| 124 | Z · A service with no store is drawn behind the store lock (P3) | data | 15 |
| 125 | AA · Home's key figure is drawn in EUR (P9) | frame | 1 |
| 126 | AA · Arabic Home's key figure is drawn in دولار (P9) | frame | 1 |
| 127 | AA · Home's basket tile loses the U+00A0 before its unit (P9) | frame | 1 |
| 128 | AA · Home on the SE draws its basket tile in EUR (P9) | frame | 1 |
| 129 | AA · A till paired back is drawn on the pairing pad (revision 21) | data | 15 |
| 130 | AA · The store's own code, online, is drawn as no answer (revision 21) | data | 15 |
| 131 | AA · A store with no staff codes by choice is drawn on a staff pad (revision 21) | data | 15 |
| 132 | AA · An unpaired till with a service open is drawn on the pairing pad, outside the lock (revision 21) | data | 15 |
| 133 | AA · The pad answers a code the sources do not hold (revision 21) | data | 15 |
| 134 | AB · Home's compare arrow is redrawn pointing up, its label unchanged (M2) | frame | 1 |
| 135 | AB · Arabic Home's basket change is redrawn with an up arrow, its label unchanged (M2) | frame | 1 |
| 136 | AB · Orders redraws #1208, a card sale, with the cash glyph, its label unchanged (M2) | frame | 13 |
| 137 | AB · Orders' #1208 leading glyph is redrawn as `check_circle`, its label unchanged (M2; revision 23: moved from Floor's T4) | frame | 13 |
| 138 | AB · Salma's VIP star keeps its label and draws nothing (M2) | frame | 13 |
| 139 | AB · Tajine poulet citron's options mark is redrawn as a star, its label unchanged (M2) | frame | 13 |
| 140 | AB · Orders' status-bar battery is redrawn as a search glyph, its label unchanged (M2) | frame | 13 |
| 141 | AB · Home's compare arrow is painted accent instead of danger (M2) | frame | 1 |
| 142 | AB · The SE Home's orders arrow, up and good, is painted danger (M2) | frame | 1 |
| 143 | AC · The sprite's `arrow_upward` and `arrow_downward` path data are swapped, so every Home arrow points the wrong way (M4) | sprite | 1, 13 |
| 144 | AC · The sprite's `check_circle` and `receipt_long` contents are swapped (M4) | sprite | 13 |
| 145 | AC · The sprite's `star` path is emptied (M4) | sprite | 13 |
| 146 | AC · Home's compare arrow is turned 180 degrees (M4) | frame | 13 |
| 147 | AC · Arabic Home's compare arrow is flipped vertically, `scaleY(-1)` (M4) | frame | 13 |
| 148 | AC · Home's compare arrow's `<use>` gets `fill="#0B6E4F"` as an attribute (M4) | frame | 1, 13 |
| 149 | AC · The same fill set as a style on the `<use>` (M4) | frame | 1, 13 |
| 150 | AC · Home's compare arrow is `visibility: hidden` (M4) | frame | 13 |
| 151 | AC · The SE Home's orders arrow is `opacity: 0` (M4) | frame | 13 |
| 152 | AC · Orders' #1208 leading icon is `scale(0)` (M4; revision 23: moved from Floor's T4) | frame | 13 |
| 153 | AC · Home's compare change keeps its danger class and is painted accent inline (M4) | frame | 1 |
| 154 | AC · The sprite's `search` path gets a `fill` attribute of its own (M4) | sprite | 13 |
| 155 | AC · Home's selected capsule item, an ancestor of its icon, is `opacity: 0` (M4) | frame | 13 |
| 156 | AD · Home's compare arrow's `svg` is `display: none` (round 18, M1) | frame | 13 |
| 157 | AD · Home's compare arrow is clipped away, `clip-path: inset(50%)` | frame | 13 |
| 158 | AD · Orders' #1208 leading icon is masked out with a transparent mask (revision 23: moved from Floor's T4) | frame | 13 |
| 159 | AD · The SE Home's orders arrow is filtered to nothing, `filter: opacity(0)` | frame | 13 |
| 160 | AD · A stylesheet rule gives the sprite's `star` path `fill-opacity: 0` | sprite | 13 |
| 161 | AD · A stylesheet rule fills the sprite's `receipt_long` path transparent | sprite | 13 |
| 162 | AD · Home's bell is painted the colour of the surface it sits on | frame | 13 |
| 163 | AD · Orders' #1208 leading icon is set at `font-size: 0` (revision 23: moved from Floor's T4) | frame | 13 |
| 164 | AD · Home's venue chevron is moved 600 px to the side, out of the frame | frame | 13 |
| 165 | AD · A plain panel is laid over Orders' #1208 leading icon (revision 23: moved from Floor's T4) | frame | 13 |
| 166 | AD · Orders' search icon is drawn as an outline only, `fill: none` and a stroke | frame | 13 |
| 167 | AE · Home's compare arrow's `use` is moved out of its box, `x="60"` (round 19, M5, case A) | frame | 13 |
| 168 | AE · Home's compare arrow's `use` is sized 0 by 0 (B) | frame | 13 |
| 169 | AE · Home's compare arrow's `svg` gets `viewBox="0 0 1 1"` (C) | frame | 13 |
| 170 | AE · Home's compare arrow's `use` is stroked 2000 wide in its own colour (D) | frame | 13 |
| 171 | AE · An ancestor's `::after`, absolute, inset −4 px, paper background, is laid over Home's compare arrow (E) | frame | 13 |
| 172 | AE · Home's compare arrow gets `box-shadow: inset 0 0 0 200px currentColor` (F) | frame | 13 |
| 173 | AE · Home's compare arrow gets a background image in its own colour (G) | frame | 13 |
| 174 | AE · Home's compare change text is filled transparent, `-webkit-text-fill-color` | frame | 1 |
| 175 | AE · Home's compare control, an ancestor, gets a background image in the arrow's colour | frame | 13 |
| 176 | AE · Home's compare control is cut away with the legacy `clip` | frame | 13 |
| 177 | AE · Home's compare arrow is covered by its own outline, drawn inward | frame | 13 |
| 178 | AF · An element inside Home's compare arrow, absolute, inset −2 px, paper background, covers it (round 20, M3) | frame | 13 |
| 179 | AF · An ancestor's `::after` is moved over Home's compare arrow by a margin, not by `left` | frame | 13 |
| 180 | AG · A: Home's compare arrow is sent behind (`z-index: -1`) its control, which paints a background (revision 21, F1) | frame | 13 |
| 181 | AG · B: the arrow's own `::before` and `::after`, each under half its width, cover it together, with a gap at its centre | frame | 13 |
| 182 | AG · C: `will-change: transform` makes the arrow the containing block of its own `::after`, which covers it | frame | 13 |
| 183 | AG · C: `contain: layout` does the same | frame | 13 |
| 184 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: AH · Floor's T7 is drawn 70.91 pt (60 cm) left of where the plan puts it | frame | none |
| 185 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: AH · Floor's T5, a round six-seater in the plan, is drawn with corners | frame | none |
| 186 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: AH · Ticket 42 of T22 moves to Ready in the fixture; the frame still tags T22 Late | data | none |
| 187 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: AH · The kitchen is drawn on the terrace, at the terrace's top edge | frame | none |
| 188 | **Retired in revision 23** (the floor is kept as shipped, §18.4); it was: AH · Floor's T9 loses its Bill tag | frame | none |
| 189 | AI · The order-status action is confirmed in the queue; the badge still draws 2 (revision 23, M1) | data | 16 |
| 190 | AI · The Action Center's badge draws 3 | frame | 16 |
| 191 | AI · The composer's mic is redrawn as `send`, its label unchanged | frame | 13 |
| 192 | AI · Salma is no longer VIP in the fixture; the segment still draws VIP 1 (revision 23, P2) | data | 9 |
| 193 | P · Kiwi AI loses the mic, its icon button removed (revision 24, P7) | frame | 19 |
| 194 | P · Kiwi AI loses the Action Center, the capsule removed with its badge | frame | 16, 19 |
| 195 | P · Kiwi AI loses Calculator | frame | 19 |
| 196 | P · Kiwi AI loses Attach | frame | 19 |
| 197 | G · The daily goal is 25,000 in the fixture; Home still draws 82% of 23,500 (revision 24, M2) | data | 18 |
| 198 | G · The 6.9 Home fills the goal mark to 100% | frame | 18 |
| 199 | G · The SE Home loses its goal line | frame | 18 |
| 200 | G · The AR Home draws "82 %" with an ordinary space | frame | 18 |
| 201 | GP · The 6.9 goal fill is scaled to a tenth (`transform: scaleX(0.1)`), its inline width unchanged (revision 25, P6: the round 25 critic's eight escapes, rows 201 to 208) | frame | 18 |
| 202 | GP · The 6.9 goal fill has `max-width: 0` | frame | 18 |
| 203 | GP · The SE goal mark is `display: none` | frame | 18 |
| 204 | GP · The 6.9 goal track is 10 px wide | frame | 18 |
| 205 | GP · The 6.9 goal fill is painted `--k-line`, the track's colour | frame | 18 |
| 206 | GP · An injected stylesheet sets `.gf{width:100%!important}` | frame | 18 |
| 207 | GP · The AR goal track is `direction: ltr`, so it fills from the left | frame | 18 |
| 208 | GP · The 6.9 goal line moves to top 236, onto the compare control | frame | 18 |
| 209 | TR · Café Atlas is a shop in the fixture; Kiwi AI still asks about dishes (revision 25, M1) | data | 20 |
| 210 | TR · The shop frame's row 1 asks the restaurant's "Which dish should I drop?" | frame | 20 |
| 211 | TR · The shop frame loses row 6, its operational question | frame | 20 |
| 212 | TR · The shop's costs are set up in the fixture; the frame still shows the new-store rows | data | 20 |
| 213 | TR · The shop has 3 sales today in the fixture; the frame still has no Today card | data | 20 |
| 214 | TR · Café Atlas's row 3 says "average check", the shipped restaurant wording, which revision 25 replaces with the tile's name | frame | 20 |
| 215 | L · Home's Kiwi AI capsule loses its label (revision 25, P13) | frame | 19 |
| 216 | L · Kiwi AI's Actions label is emptied | frame | 19 |
| 217 | L · The shop frame's Calculator loses its label | frame | 19 |
| 218 | O · The online order is accepted in the fixture; the Takeaway badge still draws 1 (revision 25, M2) | data | 16 |
| 219 | O · The Takeaway badge draws 2 | frame | 16 |

**What the icon rows prove, and the sweeps (revisions 17 to 19).** Rows 143 to 155 are the round 17 critic's cases, plus two the same holes allowed; rows 156 to 166 are one per further way to hide or blank an icon (round 18, M1); rows 167 to 177 are the round 19 critic's cases A to G and the text fill, plus three the same reads now refuse (a background image on an ancestor, the legacy `clip`, an outline drawn inward; round 19, M5); rows 178 and 179 are the two round 20 classes the check now reads (round 20, M3); rows 180 to 183 are the round 21 critic's cases A, B and C, with C's `contain: layout` form (round 21, F1), each green before revision 21 by the critic's run and red now for the reason it names. Each goes red for the reason it names (`why(n)`). Beyond the table, a sweep run for revision 18 applied fourteen changes to each of the 132 icons in turn (another symbol, a 90 degree rotation, opacity 0, `visibility: hidden`, a fill on its `<use>`, `display: none` on its `svg`, a clip-path, a mask, a filter, a transparent colour, a zero font size, an outline-only drawing, a position 2000 px to the side, and a panel laid over it), and, for each of the 35 symbols, replaced its path and hid it with a stylesheet rule: 1,910 of 1,918 were caught. The 8 not caught are the cover on the 6 icons wholly below a scroll fold (Home's and Arabic Home's last chevron, Orders' last four method icons) and on the 2 behind the AI frame's scrim, which the hit test leaves out by the rule above. Revision 19's to revision 21's classes are proven by one row each, not swept. The sprite is shared by every frame, so the mutation runner restores it after each row, and each row runs only the checks it targets. The checks and all 183 rows pass at 1024 × 768 and 375 × 812 (revision 21).

The fixture holds the day's tallies and only the 13 orders that are drawn, so no check sums the 137 orders; `components-sum-test` on Orders runs on each capture's own ledger data instead (§18.2).

### 18.1 Dashboard Home · iPhone 6.9 (440 × 956, light, EN, live, the worked example)

| y | Element | Hit area |
| --- | --- | --- |
| 0 to 62 | Status bar | |
| 62 to 106 | Nav bar. Leading, x 20: **the Kiwi wordmark** (revision 23, P6), the shipped `assets/kiwi-newlogo.svg` in light and `assets/kiwi-newlogo-inverse.svg` in dark, 22 tall (40.1 wide, its 886 × 486 ratio), decorative (`alt=""`), as the shipped dashboard shows it at the head of its sidebar (`dashboard.html@319ac100:4680-4682`); then, at x 68, the venue switcher "Café Atlas" (Body strong) with `expand_more` 20 (`nav.venue`). Trailing: the labelled capsule `nav.ai` (revision 25, P13): `auto_awesome` 24, then the label `ai.title` "Kiwi AI" (Callout strong, ink-1), 8 apart, with 12 inside each end; 44 tall, radius 22, surface-2, no border, as the Actions capsule of §18.6. Its right edge is at x 368, 8 before the bell, and its left edge moves with the label: "Kiwi AI" measures 46.9 in Callout strong (the same Latin words in every language, §6.6), so the capsule is 12 + 24 + 8 + 46.9 + 12 = 102.9 wide, x 265.1 to 368, and in Arabic x 72 to 173.8, mirrored (101.8: the Arabic frame sets no tracking). Its accessible name is the visible label. The venue switcher takes the width between the wordmark and the capsule, 8 before it, and ends in an ellipsis when the merchant's name is longer (its full name is the accessible name; a name cannot be measured, §6.6): "Café Atlas" ends at 174.1, 91 before the capsule. At factor 1.35 the label is 63.3 and the capsule 119.3, from x 248.7. Above 1.35, where the iPhone dashboard's large-type reflow applies (`f99fa1e1`, §6.4), the capsule shows the glyph alone, 44 square, and keeps `ai.title` as its accessible name, so the venue keeps its width. Then `nav.notifications` (`notifications`, badge "3", the unread count of the fixture's notifications, check 16) at x 376 to 420 | 62 to 106; the capsule and the bell 8 apart |
| 114 to 158 | Date button (§10.19): `today` 16, `range.today_date` "Today · Monday 12 October" (Footnote ink-2), `expand_more` 16. Demo adds the capsule after it | 114 to 158 |
| 162 to 210 | `data-key-figure`: "19,174" (Display, tabular) + U+00A0 + "MAD" (Heading ink-2) | Not a target |
| 214 to 232 | **Goal line** (revision 24, M2): `home.goal` "82% of the 23,500 MAD goal" (Footnote ink-2; the share from `KiwiFormat.share`, 19,174 / 23,500 = 0.816, §6.3), then 8, then **the goal mark**: a track 96 × 4, radius 2 (measured in §6.6; where the line does not fit, the mark moves under the text, 4 below it), `--k-line`, filled from its start edge in accent-ink to the share, never past its end (so 123% fills it); mirrored in AR (§9.5). The mark is decorative (`aria-hidden`), because the text says the same. With no goal set, a row of its own replaces the line (below, revision 25, P2); on the 7 days and 30 days ranges the line is not drawn, because the goal is a day's | Not a target |
| 236 to 280 | Compare control (§10.33): `arrow_downward` 16 + "−1,127 MAD (−5.6%)" (Footnote strong, danger: revenue's polarity is up-is-good) + 6 + "vs yesterday at 17:39" (Footnote ink-2, no leading space: the 6 is the gap, §10.33) + `expand_more` 16 | 236 to 280 |
| 288 to 332 | Range presets, compact segmented (visual 292 to 328), x 20 to 420: `range.today` · `.yesterday` · `.d7` · `.d30`, lens on Today | 288 to 332 (8 below the compare control) |
| 348 to 508 | Chart (§10.22), **160** tall: the legend band 348 to 374 (legend line 352 to 370: solid "Today", dashed "Yesterday at 17:39"), then the data area 374 to 508, whose top gridline (at 374) is the larger series' maximum, labelled "30.1K" at the end edge of the band, so no line enters the band; the 20K and 10K gridlines sit below it. Yesterday's baseline reads 20,301 at 17:39. A tap opens the data sheet (`chart.show_data`); a 240 ms hold scrubs | 348 to 508 (16 below the range presets) |
| 516 to 624 | Tiles 194 × 108, gap 12, 8 below the chart: x 20 to 214 "Orders · 137 · ↑ +4" (accent-ink); x 226 to 420 "Average basket · 140 MAD · ↓ −13 MAD" (danger) | Each tile |
| 636 to 744 | "Card share · 66% · ↑ +1 pt" (the share from `KiwiFormat.share`, §6.3) (**ink-2**, neutral polarity, §10.21); "Returning · 3 · of 8 customers" (`home.returning_value`) | Each tile |
| 752 to 770 | Section label `home.latest` "Latest orders" (Footnote strong ink-2), the iOS grouped-list header form: text only, not a target | |
| 778 onward | One surface-1 group: 3 rows of 64, "#1208 · Table 2" / "Card · 17:36" / "156 MAD"; "#1207 · Takeaway" / "Cash · 17:31" / "84 MAD"; "#1206 · Table 10" / "Card · 17:24" / "212 MAD"; then a row of 52, `home.see_all_orders` "See all 137 orders" with `chevron_right` 20 | Each row (one group) |
| 852 to 914 | Tab capsule (Home selected), x 20 to 420, floating, with `nav.*` labels | 852 to 914 |

**At rest the first order row is fully visible**: it spans 778 to 842, 10 above the capsule (≥ 8, §7.1; revision 24, M2: the goal line takes 22, and the gaps after the chart and after the tiles go from 16 to 8 to pay for it), so the section label always has a row under it in the first frame (revision 4 showed the "Latest orders" header with every row behind the capsule). The other rows and "See all" scroll under the capsule's material, as chrome intends (§7.5). The scroll view ends at the capsule's bottom edge (914), so nothing ever shows under the home indicator (914 to 956, bg), and its bottom content inset is 78 (the capsule's 62 + 16), so the last row scrolls clear of the capsule.

**How the space was found:** the legend band (44 + its 8 gap) moved into the plot's own reserved top band (26, §10.22), and the section header became a 18-tall label with an 8 gap instead of a 44 band with a 16 gap and a separate "See all" button (which is now the group's last row). Together that is 52 + 34 = 86, which is what lifts the first row from 858 to 772.

**Gaps in the flow** (all tokens; revision 24 adds the goal line): 8, 4, 4, 4, 8, 16, 8, 12, 8, 8.

**No goal set (revision 25, P2).** Every new store starts here, so the control is a full-size target. Plain `home.goal_set` "Set a daily goal" (Footnote strong, accent-ink, leading) takes a row of its own with a 44 hit area, and opens Settings › Business › `settings.goal`. Revision 24 gave it the goal line's 18, a 26 tall hit area that could not grow without running into the compare control. The rows below move down 26, and the chart gives back 28 so the first order row stays in full view:

| y | Element | Hit area |
| --- | --- | --- |
| 214 to 258 | `home.goal_set` (Plain), its label centred | 214 to 258 |
| 266 to 310 | Compare control | 266 to 310 (8 below) |
| 318 to 362 | Range presets | 318 to 362 |
| 378 to 510 | Chart, **132** tall: legend band 378 to 404, data area 404 to 510 (106, more than the SE's 94) | 378 to 510 |
| 518 to 626, 638 to 746 | Tiles | Each tile |
| 754 to 772 | `home.latest` | |
| 780 to 844 | First order row, 8 above the capsule (852) | The row |

Gaps: 4, 8, 8, 16, 8, 12, 8, 8. On the SE (§18.11) the same row is 172 to 216, the compare control 224 to 268, the presets 276 to 320, the chart keeps its 120 at 336 to 456, and the first tiles end at 572, 25 above the capsule. The preview draws the goal set, the worked example's state.

**The figures reconcile:**
- yesterday at 17:39: 133 orders, 20,301 MAD;
- 19,174 − 20,301 = −1,127, which is −5.55 %, shown as −5.6%;
- average basket 19,174 / 137 = 139.96 vs 20,301 / 133 = 152.64, so −12.68, shown as −13 at whole precision;
- returning 3 of 8 (§18.0 check 8);
- the goal: 19,174 / 23,500 = 0.8159, shown as 82% (§18.0 check 18).

**Kept, moved (revision 24, M2):** the daily goal is the goal line above, and the "Kiwi Insights · Recommandations du jour" card is Kiwi AI's first card (§18.6). **Removed:** the quick-action row (its Day report, Invoicing and Export move to the places §12's table names; Customize is removed, §22; revision 23, M2), the hamburger, the AI glow, the avatar (now in More › Settings), the margin tile (Report shows margin when dish costs exist), the **Success rate** tile, the shipped **Compare** button (its job is now the compare control, which names its baseline), and revision 4's legend band and "Show data" button (now inside the chart, §10.22).

**Type steps:** Display (key figure), Title (tile values), Heading (the unit after the key figure), Body (venue, rows, "See all 137 orders"), Footnote (date, goal line, compare, segmented labels, tile labels and deltas, the section label, row subtitles, axis, in-plot legend, tab labels, badge) = **5**. **Principle 1:** 0 primaries (a reading screen); the key figure (44) is the largest text ✓.

**Dark:** same geometry. The hero is 17.13:1 on bg; the delta in danger 8.52:1; the chart line and now-dot ring in accent-ink and mint (§10.22).

**AR (RTL), dark:** mirrored as in §9.5: the venue switcher at the right, the icons at the left, the chart's business day starting at the right, the tab order with Home at the right. Numbers stay LTR inside `<bdi>`: "19 174" with U+00A0, then "درهم"; the delta "−1 127 درهم (−5,6 %)". The preview renders this frame.

### 18.2 Orders · iPhone 6.9 (light, EN)

| y | Element | Hit area |
| --- | --- | --- |
| 62 to 106 | Nav bar: inline title `nav.orders` (Body strong), centred. Trailing icon buttons Search (x 324 to 368) and Filter (`filter_list`, x 376 to 420; channel and staff) | 62 to 106 |
| 114 to 158 | Date button, as on Home | 114 to 158 |
| 162 to 196 | `data-key-figure` "19,174.00 MAD" (**Title**, tabular) | Not a target |
| 200 to 218 | Footnote ink-2: `orders.summary` "137 orders · average basket 139.96 MAD" | |
| 226 to 270 | Filter segmented (radiogroup), compact (visual 230 to 266): `orders.all` · `.card` · `.cash` · `.other` · `.refunds`, segments sized to their labels (§10.6) | 226 to 270 |
| 286 to 314 | Sticky hour header "17:00" (Footnote strong ink-2) | |
| 314 onward | Rows of 64, one group per hour, newest first: a leading method icon in a 36 square (`credit_card` for a card, `payments` for cash, `sync_alt` for `pay.other`, money moved between two accounts, `undo` for a refund; the shipped list draws no method icon, so the choice is the design's); title "#1208 · Table 2", subtitle "Card · 17:36 · Karim", trailing "156.00 MAD". The 17:00 group holds every order of the hour from §18.0, in order: #1208, #1207 (Takeaway), #1206 (Table 10), #1205 (Takeaway), #1204 (Table 8), #1203 (Takeaway), the refund row `orders.refund_row` "#1201 · Table 7 · Refund" / "Card · 17:12 · Karim" / "−45.00 MAD" in danger, #1202 (Table 5), #1201 (Table 7, 132.00), #1200 (Takeaway). The 16:00 group follows with #1199, #1198, #1197 | Each row |

**Behaviour:**
- Infinite scroll with skeleton rows; pull to refresh (Adjust at 64 pt, once, §15.1).
- Empty: `orders.empty`; Refunds filter empty: `orders.empty_refunds` with `action.clear_filter`.
- `components-sum-test`: on each capture's own ledger data, all of the day's rows sum to the key figure net of refunds. The worked example holds the day's total and the 13 drawn orders, not all 137, so this test does not run on it (§18.0).
- Reconciliation and anti-fraud (revision 24, P9): `main` removed both tabs from the Commandes drawer in `cda95c04` (phase 1: no acquirer data), so this direction gives them no home (§12).
- **An order's detail** (revision 23, M2) carries `invoice.a4`, which opens the sale's legal A4 invoice with its PDF and print, as shipped (`assets/pages-pro.js@319ac100:20413-20440`, `:20755-20770`). Until the sale is synced it is disabled and says `invoice.wait`; a refund has none.
- **Filter Other** (`orders.other`) replaces the shipped Mobile filter and lists the same orders: those recorded with the method `wallet` (`assets/pages-pro.js@319ac100:259-264`). The shipped names for that method disagree: the dashboard says Mobile and "Kiwi Wallet", the till prints "Virement", a transfer (`kiwi-caisse.html@319ac100:16566`, `:16860`, `:16991`), and no button of the shipped till records it. The design records `pay.other` as `wallet`, so one filter holds both, and names it "Other", which claims nothing about how the money moved. Kiwi Tap, QR and link payments stay under Card, as shipped (anything not cash or `wallet` is a card, `pages-pro.js@319ac100:259-260`). The worked example has no such order, so no row draws `sync_alt`; the frame's filter draws the fifth segment.

**Type steps:** Title, Body, Footnote = **3**. **Principle 1:** 0 primaries; the key figure (Title, 28) is the largest text, because the page title is the inline Body-strong title (§10.18).

### 18.3 Till: menu, bill and payment · iPad 13 landscape (1376 × 1032, light, EN, restaurant)

**Rail**, x 0 to 88:
- surface-2 ground;
- **the Kiwi wordmark** (revision 23, P6) centred in the head above the first item, y 10 to 30, 20 tall (36.5 wide), the same two shipped files as Home, decorative, as the shipped till shows it at the head of its sidebar (`kiwi-caisse.html@319ac100:6063-6064`; `:6366` draws it in the empty bill pane too);
- items from y 40 at 72 each: Floor, Takeaway (badge 1, the online orders to accept, revision 25, M2, below), Waiting, Kitchen (badge 3, the New tickets, §10.13), More;
- cashier avatar 44 at y 940 with the initials "ON" (§18.0 staff), "Othmane" in Footnote at 988 to 1006; the sync indicator sits above it while §10.26 item 3's visibility rule holds (any of rows 1 to 7, not only a non-empty outbox; revision 12, P2).

**More, the rows revision 24 adds (M1).** The till's More sheet (§12) keeps every function of the shipped rail; §12's table maps each rail control to its row. The rows added here, each a list row (§10.8):
- **Open the drawer** (`till.more.open_drawer`, Shift; shown only when the store's `open-drawer` module is on, as the shipped button's `data-feature` is): opens the manager approval inside its sheet (`act.open_drawer`, §10.2), then sends the drawer signal and shows the `drawer.*` lines, as a cash payment does (§10.26). It records a zero movement, "no sale", as the shipped `openDrawerNoSale` does (`kiwi-caisse.html@31c94529:17021-17045`), so the shift change and the day report show who opened the drawer and when.
- **Team on shift** (`till.more.team`, Shift, every role, as shipped): the trailing value is the count of people on shift and not on break (`activeServerCount`, `:17518-17520`). It opens a large sheet titled `till.more.team` with three sections, `till.team.on`, `till.team.break` and `till.team.off`; each person is a row with the avatar's initials, the name, and for a person on break `till.team.break_since`. A person on shift carries `till.team.start_break`, a person on break `till.team.end_break`, and every person `till.team.message`, all Secondary M; where a row's buttons do not fit beside the name (a phone till, Arabic, a larger text size), they move under it, as a list row's trailing value does (§6.4); the sheet's footer holds Secondary M `till.team.message_all`. A break needs no code and a connection: it posts `manager-pause` or `manager-resume` to `/api/team/live`, which a paired till may do (`functions/api/team/live.js@31c94529:151`, `:190-212`); the button is busy until the answer, and a failure leaves the status as it was with `till.team.break_failed`, or `till.team.not_clocked_in` on a 409. A message opens a sheet titled `till.team.message_to` (or `till.team.message_all`), with the field `till.team.message_field` and Primary `till.team.send`, disabled until the field holds text. **Above the field, the four shipped quick messages** (revision 25, M3; `kiwi-caisse.html@31c94529:7199-7203`): one-tap chips (§10.7, Callout strong, in a row that wraps), `till.team.quick` "Table ready", "Customer waiting", "Till" and "Break over". A tap puts the chip's message, `till.team.quick_text`, in the field, as shipped (`:17718-17722`), and enables Send, so a quick message is a chip and Send, two taps, as shipped; unlike the shipped chip, the tap does not focus the field, so no keyboard opens over a message that is ready, and the person can still edit it. In the iPad's 720 sheet (content 672) the four chips hold one row in every language; on a phone they wrap to two (§6.6). The send posts `action: 'message'` (`kiwi-caisse.html@31c94529:17724-17742`) and answers `till.team.sent` or `till.team.not_sent`. A real store with no roster shows `till.team.empty`. This is where breaks are started and ended, which `clock.break_note` and the team app (§18.10) point to. None of these fires a haptic.
- **Sales this shift** (`till.more.sales`, Shift): a large sheet with a segmented control, `till.sales.summary`, `.items` and `.journal`, the shipped journal's three tabs (`:6965-6967`). The Summary starts with the figures the shipped rail showed (transactions with the card and cash split, the average ticket, tables settled; `:6068-6081`).
- **Fullscreen** (`till.more.fullscreen`, `till.more.exit_fullscreen` while on, This device): shown only when the till runs in a browser whose Fullscreen API is enabled (`document.fullscreenEnabled` or `webkitFullscreenEnabled`), **hidden in the native app** (`html.kiwi-native`), which has no browser chrome to leave. The shipped native app already hides it: the rule at `app/src/native-runtime.css:62` (at `31c94529` and on `origin/main`) lists `html.kiwi-native #fs-toggle` among the selectors set to `display:none!important`, so this matches the shipped app and is not a difference.
- **Reload the till** (`till.more.reload`, This device): the shipped refresh, which reloads the page; the service is saved on unload (`assets/caisse-refresh.js@31c94529`, header, and `:204-218`).
- **Till ID** (`till.more.device_id`, This device, paired tills only): the trailing value is the id's last six characters in the Latin face with `tnum`, as §1 sets codes; a tap copies the id and shows `till.device_id_copied` (`:18711-18730`).
- **Sign out** (`settings.sign_out`, This device, last): the shipped `/auth/logout` link (`:6143-6146`), which ends the session on this till.
- **Stock** (`till.more.stock`, Shift, every role; revision 25, P9): the shipped rail button has no role check and is the till's only entry to Stock and purchasing (`kiwi-caisse.html@31c94529:6110-6117`, `openStock` `:20533-20534`), so it stays open to every role. Its trailing value is the shipped alert count, the items under their alert level (`updateStockBadge`, `:19851`), as a badge in danger ink when above 0 (§10.13). It opens the shipped Stock screen, which this direction reskins at stage 4 with the business-type tills and does not redesign (§12).

**Online orders: the inbox's home (revision 25, M2).** Shipped, a paired till of a store with online ordering on (`KiwiConfig.features.orderpro === true`, `assets/orderpro-inbox.js@31c94529:723-726`) floats a "Commandes" chip (`#kop-chip`, `chip()`, `:734-748`) with the count of orders waiting; it opens an overlay (`#kop-root`, `open()`, `:750-834`) of cards in three groups, À accepter, En cuisine and Prêtes (`paint()`, `:697-711`, the groups at `:708-710`). Orders come from guests' phones and from delivery channels (`SRC`, `:544`), and the till polls every 6 s (`:22`, `:843-848`). Nothing is accepted automatically (the file's header, `:5-9`).
- **Where it lives.** At the top of the Takeaway tab, above the till's own takeaway orders: the header `online.section`, then the groups `online.to_accept`, `online.in_kitchen` and `online.ready`, each with its count, drawing only the groups that hold an order. A table's order from the guest QR is there too, because accepting is a counter decision; its card's `floor.table` "Table 4" opens that table's bill, as the shipped `data-kop-table` does (`:763-767`). The floor plan is unchanged (§18.4): nothing is added to it.
- **The rail.** The Takeaway item carries a badge (§10.13) with the number of orders to accept, drawn only when online ordering is on and the number is above 0, and its accessible name becomes `till.nav.takeaway_a11y`. The worked example has one order to accept, so the badge reads 1 (check 16). The Kitchen badge still counts New tickets: an order to accept becomes a ticket only when it is accepted.
- **The card**, one surface-1 group per order (§10.8): the reference; `orders.takeaway`, `online.delivery` or `floor.table`; the channel's name when it is not Kiwi (Glovo, Yassir, Shopify, or `online.source.generic`); the waiter for a table; the time placed and the time since, in danger ink from 15 minutes as shipped (`:661-666`); the total; the lines and the customer as shipped (`linesHtml` `:600`, `custHtml` `:546`). Its actions are Item buttons (§10.1), in the shipped order (`:668-689`), wrapping to a second row where they do not fit (a phone till, FR; widths in §6.6): to accept, `takeaway.reject`, `online.accept`, and `bill.take_payment` while unpaid; in the kitchen, `online.cancel`, `kds.mark_ready`, `bill.take_payment`; ready, `online.cancel`, then `kds.mark_served` for a table or `online.hand_over` otherwise, and `bill.take_payment`. A trailing icon button `online.print` (`print`) prints the order's kitchen ticket (`printOrder`, `kiwi-caisse.html@31c94529:22447-22470`); its handler ships (`orderpro-inbox.js@31c94529:768-773`), but no card draws a button for it at `31c94529` or on `main`, so 2027 draws one. §12's act table names each action's entry.
- **Requests.** Every change of state is `POST /api/order/queue {merchant, id, status}` (`:256-282`), with no outbox, as shipped: the button is busy until the answer, and a failure leaves the card as it was with `online.not_confirmed`, or `online.refused_pairing` on a 403 (`:265-277`). Reject and cancel take the till approval (`act.reject_online`, `:241-251`, §10.2). Charging opens the till's payment for the order (`checkoutOrder`, `:774-778`), recorded as any sale (§10.26). Accepting fires Commit when the server's `ok` lands within 600 ms of the tap (`trigger: 'server-ack'`, §15.2); the other actions fire nothing.
- **The arrival alert**, once per poll that brings orders the till had not seen (`:180`, `:196`), whatever their number:
  - **sound:** the shipped arrival tones, 880 Hz then 1,174 Hz 160 ms later, each 300 ms with a 20 ms attack to a peak gain of 0.13, synthesised with Web Audio (`:430-444`), so there is no file to download. It plays on every till surface at the device's `device.order_sound` switch (This device, default on, shown when online ordering is on);
  - **haptic: none.** A new order arriving never buzzes (§15.6): the shipped `navigator.vibrate([40, 60, 40])` (`:429`) and the 20-minute warning's (`:490`) are removed (§20.3), and an iPad has no haptics (§15.0);
  - **visual:** the toast `online.arrived` with `online.arrived_sub` (§10.17), and the badge's new count. The badge pops (`scale 0.6 to 1`, `--k-dur-4` spring, as the tile badge does, §14.4), and the Takeaway item takes an accent ring that fades over `--k-dur-7`, a colour animation (§14.4, exception 3). This replaces the shipped chip's glow, which loops for 6 s (`kop-pulse`, `:83`, `:86`, `:428`) and is outside the motion vocabulary;
  - **reduced motion:** no pop and no ring; the badge appears at its final size and the toast crossfades (§14.5). The sound still plays, because it is not motion;
  - **screen readers** hear the toast once, politely (§10.17).
- **Twenty minutes waiting.** As shipped (`warnExpiring`, `:466-493`), an order still to accept after 20 minutes raises `online.expiring` once, with its reference and the minutes left before the server's 30-minute expiry. No haptic.
- **Migration.** Stage 4 draws this section and the badge and retires `#kop-chip`, `#kop-root` and their styles (`css()` `:71`, `chip()`, `open()`, `paint()`, `cardHtml()` `:653`); `orderpro-inbox.js` keeps its poll, `setStatus` and the expiry warning as the data the section reads (§21.1).

**Menu pane**, x 88 to 944, on bg (width 856, 4 columns by §13.3):
- y 24 to 68: search field 44 at x 112 to 472 (placeholder "Search the menu"); secondary M `menu.enter_amount` with `dialpad` 20, **sized to its label** and ending at x 920: 165 wide in EN (x 755 to 920), 196 in FR (x 724 to 920), measured in §6.6.
- y 84 to 128: category scrolling segmented (default, 44), one segment per menu category in the fixture's order: "Starters · Tajines · Couscous · Pastillas · Drinks · Desserts". There is **no "All" segment**: the grid always shows every category, so the track is a jump list, and **the lens sits on the category whose section header is stuck under the track**. At rest that is Starters, the sticky header below; tapping a category scrolls its section to the top, and scrolling moves the lens. A 32 px edge fade.
- From y 144: section header "Starters" (Heading), sticky under the track.
- Grid: x 112 to 920, 4 columns of 190, gap 16, tiles min-height 112, surface-1, radius 20, padding 16.
- Tile anatomy:
  - name in Body strong (2 lines, then ellipsis; the full name is in the accessible name);
  - price "45.00 MAD" in Callout, tabular, ink-2, bottom start;
  - `tune` 20 at bottom end when the item has options;
  - in-bill qty badge 28 top end.
- Tap adds (Adjust on the confirmed tap) or opens options (§10.24). Sold out: ink-3, "Sold out", `aria-disabled`.

**Bill pane**, x 944 to 1376 (432), surface-1, leading hairline:

| y | Element |
| --- | --- |
| 24 to 56 | "Table 4" (Title); trailing icon buttons `bill.print` (`print`, x 1256 to 1300) and `action.more` (`more_horiz`, x 1308 to 1352), y 24 to 68 |
| 60 to 78 | `bill.meta` "3 guests · open since 17:02 · Karim" (Footnote ink-2) |
| 102 to 120 | `bill.not_sent` "Not sent · 2" (Footnote strong, accent-ink), 24 below the meta |
| 128 to 184 | "1× Tajine poulet citron / No olives / 150.00" |
| 184 to 240 | "1× Salade marocaine / 45.00" (the two rows abut as one group) |
| 256 to 274 | `bill.sent_at` "Sent 17:28" (Footnote ink-2) |
| 282 to 338 | "1× Harira / 35.00" |
| 792 | Footer hairline |
| 804 to 852 | "Total" (Body ink-2) / "230.00 MAD" (Title, `data-k-total`, parts 150.00 + 45.00 + 35.00) |
| 864 to 908 | Secondary M, two buttons, x 968 to 1156 and 1164 to 1352: `bill.split` "Split" (`call_split`) and `bill.discount` "Discount" (`percent`) |
| 924 to 980 | Primary L `bill.send` "Send 2 to kitchen" (`send` 20), x 968 to 1352 |

**Gaps** in the pane: 4, 24, 8, 0 (one group), 16, 8; the footer is pinned. `bill.print` sits in the header. The secondary row's labels are measured in §6.6: at 432 and 360 every language fits an M button with its icon; at **320** the EN "Discount" needs 69.7 of 72, 2.3 to spare at factor 1 and over at 1.12, so at 320 the row is always the toolbar form (icon 24 over a Footnote strong label, min-height 56), in every language, so the layout never depends on the language.

When the send is recorded (Commit, §15.3), the two lines move under a new "Sent 17:39" header (ticket 51 in the fixture's next state) and the primary becomes `bill.take_payment` "Charge 230.00 MAD".

**Payment** (`bill.take_payment` "Charge 230.00 MAD" pushes inside the pane, `--k-dur-5`):

| y | Element | Hit area |
| --- | --- | --- |
| 24 to 68 | Back icon button (x 968 to 1012) and `pay.title` "Table 4 · Payment" (Heading) | 24 to 68 |
| 84 to 102 | `pay.amount_due` (Footnote ink-2) | |
| 106 to 138 | `data-key-figure` "230.00 MAD" (Title, tabular); with a tip, base + tip ("253.00 MAD", 161.6 wide in EN, §6.6) | |
| 142 to 160 | Reserved slot for `pay.tip_breakdown` "Bill 230.00 · Tip 23.00" (Footnote ink-2), empty with no tip, so choosing a tip moves nothing | |
| 176 to 240 | Tip row (§10.26): `pay.tip` with the trailing value `pay.tip.none` "No tip" and `chevron_right`; opens the tip popover | 176 to 240 |
| 256 to 448 | Method list, 3 rows of 64: `pay.cash` (chosen by the cashier), `pay.card`, `pay.other` | Each row (one group) |
| 464 to 489 | `pay.received` "Received 250.00 MAD" (Heading, tabular) | |
| 497 to 541 | Chips (radiogroup), 8 apart: `pay.exact` "Exact", "250.00", "300.00"; the amount due is the key figure above, so the Exact chip does not repeat it (251.1 of 272 in EN and FR, 257.5 in AR, in the narrowest pane, §6.6) | 497 to 541 |
| 549 to 861 | Keypad, 4 rows of 72 with 8 gaps; keys **120** wide with 12 gaps (x 968 to 1352), the 432-pane row of §10.25 | 8 below the chips |
| 869 to 894 | `pay.change` "Change 20.00 MAD" (Heading), received − (base + tip) | |
| 894 to 924 | **Remainder, not a gap token** (revision 7, P12): the primary is **pinned** to the pane's footer at H − 108 to H − 52 (as the bill pane's footer is), and the stack above flows from the top with tokens, so this distance is whatever the height leaves: 30 at 1032, never under 16 (the regular form's floor, below) | |
| 924 to 980 | Primary L `pay.cash.confirm` "Confirm cash payment". The amount due is the key figure (106 to 138) and the change is the Heading at 869 to 894, both directly above, so the button names the act, not the figures; this keeps it on one line in every language at every pane width (176.9 of 232 at 320 in EN, §6.6) | 924 to 980 |

**Height forms (revision 7, M3).** The stack above needs **H ≥ 1018** (the change ends at 894, then 16, the 56 primary and the 52 below it). Below that the keypad would be pushed under the fold, so the pane switches to the **compact form**, chosen from the viewport height alone (`layout.js`, §13.3), never by scrolling. In the compact form the payment uses **both panes**, because the menu cannot be used while a bill is being paid:
- **Summary column, over the menu pane**: the menu pane's content is replaced, for the payment only, by a column of content width 384 aligned to the pane's end (next to the bill pane), 24 from it, on surface-1 with the pane's radius. y 24 to 68 Back and `pay.title`; 84 to 102 `pay.amount_due`; 106 to 138 the key figure; 142 to 160 the breakdown slot; 176 to 240 the Tip row; 256 to 448 the method list. The rest of the menu pane is bg, empty.
- **Keypad column, in the bill pane**: y 24 to 49 `pay.received`; 57 to 101 the chips; 109 to 421 the keypad (the pane width's row of §10.25); 429 to 454 `pay.change`; the primary pinned at H − 108 to H − 52.
- The keypad column needs H ≥ 454 + 16 + 56 + 52 = **578**, which every iPad clears in both orientations.
- **Compact short, 514 ≤ H < 578 (revision 8, F5; desktop windows only):** the same two columns with the keypad stepped down to keys **56** tall (still above the 44 target, digits stay Title): received 24 to 49, chips 57 to 101, keypad 109 to 357 (4 × 56 + 3 × 8), change 365 to 390, the primary pinned at H − 108 to H − 52, so the column needs 390 + 16 + 56 + 52 = **514**. Nothing inside either column scrolls.
- **Below 514** no form fits, and the till says so rather than scroll the keypad: the page keeps `min-height: 514px`, so the browser window scrolls the page as a whole, keypad included and intact. No iPad or phone reaches it (the shortest landscape iPad is 744). Reading and focus order: summary column, then keypad column (mirrored in Arabic). The two columns share one `role="group"` named by `pay.title`. Card and Other use the same split, with their bodies in the keypad column.
- On a phone till (a large sheet, §13.3) the order is the regular stack; when Cash is chosen the keypad docks at the bottom of the sheet with received, chips, change and the primary, as the count sheet does (§18.9), and the summary above it scrolls on the SE. The keypad itself never scrolls.

| Device, landscape | Viewport | Bill pane | Form |
| --- | --- | --- | --- |
| iPad Pro 13, iPad Air 13 | 1376 × 1032, 1366 × 1024 | 432 | Regular (H ≥ 1018) |
| iPad Pro 11 (M4) | 1210 × 834 | 432 | **Compact** |
| iPad Pro 11 (earlier generations) | 1194 × 834 | 432 | **Compact** |
| iPad Air 11, iPad 10th and 11th generation | 1180 × 820 | 432 | **Compact** |
| iPad mini | 1133 × 744 | 360 | **Compact** |
| Portrait, every iPad | heights 1133 to 1376 | 320 or 360 | Regular |
| Desktop window | any | by width | Regular from H 1018; compact from 578; compact short (56-tall keys) from 514; below 514 the window scrolls the whole page, never a column |

Then the paid moment on the local record (§10.26), the drawer status line, the receipt choice, which waits, then return to Floor. **This hero is an iPad, and an iPad has no haptics** (§15.0): the paid moment is confirmed by the paid sound and the settle animation alone. The same flow on a phone till adds the Paid haptic.

**Type steps:**
- Bill frame: Title, Heading, Body, Callout, Footnote = **5**.
- Payment frame: Title (amount due, keypad digits), Heading (pane header, received, change, menu section header), Body (rows, buttons, tile names), Callout (chips, tile prices), Footnote (labels, rail) = **5**.

**Principle 1:** 1 primary per frame ✓; the menu pane has none. In the payment frame the key figure is Title and nothing is larger ✓.

### 18.4 Floor

**The floor plan is not redesigned. It stays as shipped (owner, 2026-10-13).** It lives in `assets/floorplan-core.js` (the plan's model and drawing) and `kiwi-caisse.html` (`caisseFloorPlan`, `renderRealGrid` and `setupRealSalle`, `@319ac100:8126-8560`; its rules, `:5363-5470`), with its phone form, its interactions and the bill it opens, as they ship.

**It keeps its current styles.** The kit's tokens are all `--k-*` and collide with nothing (§20.7), so the kit landing changes nothing in how the plan renders. The plan's rules use literal colours and four custom properties of the till's own: `--mono` (Arial, `kiwi-caisse.html@319ac100:197`), `--emerald` (`:158`, `:234` in dark), `--font-ui` (unset, so Inter Tight) and `--pad` (set by the renderer). Stage 7, which retires legacy tokens and layers, keeps every rule and custom property the plan reads, and §22's paint deletions do not apply to them.

### 18.5 Customers · iPhone 6.9 (light, EN)

| y | Element | Hit area |
| --- | --- | --- |
| 62 to 106 | Nav bar: inline title `nav.customers` (Body strong), centred; trailing icon buttons, 8 apart: `action.more` (`more_horiz`) at x 324 to 368, a popover menu (§10.4) of `customers.export`, `customers.loyalty`, `ia.retention` and, when campaigns are on, `customers.campaign`; and `customers.add` (`person_add`) at x 376 to 420 | 62 to 106 |
| 114 to 132 | Footnote ink-2: `customers.summary` with `customers.known` "8 known customers · 7 can be contacted" | |
| 140 to 184 | Search field: placeholder `customers.search` | 140 to 184 |
| 192 to 236 | Segmented (radiogroup), compact (visual 196 to 232): `customers.all` 8 · `customers.status.regular` 4 · `customers.segment.vip` 1 · `customers.status.new` 2 · `.inactive` 2 | 192 to 236 (8 below the field) |
| 252 onward | Rows of min-height 72, sorted by last visit (§18.0): avatar 40; name (Body), with `star` 16 in accent-ink and the spoken marker `customers.vip` for Salma; "Casablanca · last visit today" (`customers.last_visit`, Footnote, wraps to 2 lines rather than truncating, §10.8); trailing "11,780 MAD" (Body, tabular, whole) over the status word (Footnote ink-2) | Each row (one group) |

**Counts add up:** Regular 4 + New 2 + Inactive 2 = 8 = All. VIP 1 is a filter over those eight, as the shipped VIP segment is, not a status, so it sits outside the sum. **Search** keeps e-mail, as shipped (`customers.search`). Every customer has exactly one status from `segmentCustomer()`; VIP is a marker on top of a status (Salma, a Regular), never a fourth status. The three customers with a visit today and at least two visits (Salma, Youssef, Leila) are Home's "Returning 3 of 8" (§18.0 check 8); Leila is New and returning, because her first visit was on 3 October, 9 days ago.

Statuses are words, not coloured pills. Retention shows the same words for the same people.

**Removed:** the four count cards and the New customer primary (now the nav icon). **Moved, not removed (revision 23, M2):** the icon row's four buttons go to the nav's overflow: Export (CSV), Loyalty program (the gift icon, `redeem`), Retention (the people icon) and Campaign when campaigns are on, as shipped (`assets/clients-directory.js@319ac100:367-370`, `:405-410`). The critique read the gift and people icons as birthdays and groups; at `319ac100` they are the loyalty program and retention. Birthdays stay a field of each customer's record.

**Type steps:** Body, Footnote = **2**. **Principle 1:** 0 primaries; no key figure is declared on this list ✓.

### 18.6 Kiwi AI · iPhone 6.9 (sheet at the large detent, light, EN)

| y | Element | Hit area |
| --- | --- | --- |
| 74 | Sheet top; grabber 82 to 87 | |
| 92 to 148 | Header: `ai.title` (Heading) leading. Trailing controls, 8 apart: **the Action Center**, a labelled capsule at x 231 to 368, y 98 to 142 (44 tall, radius 22, surface-2, no border). It holds the `pending_actions` glyph (24), then the label `ai.actions.button` "Actions" (Callout strong, ink-1), then the badge "2", 8 apart, with 12 inside each end. Its right edge is 8 before the close button, and its left edge moves with its width, so a two-digit count widens the badge and the capsule grows to the left. The badge is hidden when no entry waits, as shipped, and the label stays. Its accessible name is `ai.actions.pending_a11y` ("Actions, 2 to confirm") or `ai.actions.button` when none waits, so the visible word is part of the name. Measured in Chromium 155 with the shipped faces (§6.6): the capsule is 12 + 24 + 8 + label + 8 + badge + 12, with the label in Callout strong (15 px, 600; 0.01em in Latin). At factor 1 the label is 52.5 in EN and FR ("Actions") and 57.2 in AR (الإجراءات), so the capsule is 136.5 and 141.2; at 1.35 the label is 70.9 and 77.2 and the badge grows to 24 (§10.13), so the capsule is 158.9 and 165.2. `ai.title` "Kiwi AI" (Heading, 600; the same Latin words in every language) is 61.1 at factor 1 and 82.5 at 1.35. Between the title's end and the capsule, after an 8 gap, 142.4 (EN, FR) and 137.7 (AR) stay free at factor 1, and 98.6 and 92.3 at 1.35, so the header holds one line up to 1.35; above it, on the iPhone dashboard since `f99fa1e1`, the large-type reflow of §6.4 applies. The label and the badge never shrink. Close (`action.close`) at x 376 to 420. The Action Center shows to an owner or a manager only, as shipped (`assets/agent-action-center.js@319ac100:32-35`, `:255`) | 98 to 142 |
| 160 to 208 | Body ink-2, two lines (2 × 23.8 = 47.6): `ai.intro` | |
| 212 to 256 | Plain (`step="body"`): `ai.how` | 212 to 256 |
| 272 to 426 | Today card, **the first card** (revision 24, M2; only when the store has a sale in today's business day: before the first one there is nothing to quote, and `ai.try` moves up to 272, as the shop frame below draws), surface-2, radius 20, padding 16: `ai.today` "Today at 17:39" (Footnote ink-2, 288 to 306); `ai.today_down` "19,174 MAD from 137 orders, 1,127 MAD less than yesterday at the same time." (Body, 2 lines, `k-figure`, 310 to 358); source chip `ai.source.sales_today` (§10.7, **surface-1 on the s2 card**, Callout strong, 366 to 410) | Chip 366 to 410 |
| 442 to 460 | `ai.try` (Footnote strong ink-2) | |
| 468 to 728 | 5 suggestion rows of 52: **rows 1 to 3 are the trade's questions** (revision 25, M1), here `ai.suggest.restaurant`'s three, then **the two shipped simulators**, `ai.suggest.hire` and `ai.suggest.price_rise` (with 5%, a whole percent, §9.6), the questions the shipped "Simulate a hire" and "Test a price rise" cards send (`assets/agent.js@319ac100:1502-1503`, `:1510-1513`), in a **surface-2** group, one step from the surface-1 sheet (§10.8), so the group reads as a container | Each row (one group; 58 below the chip) |
| Conversation | Question bubble trailing (surface-2, radius 20, max 320, Body). The answer is full width, Body ink-1, with figures through `k-figure` and source chips under it; then, as shipped, up to two follow-up chips (§10.7, Callout strong) that the answer names: `ai.follow.*`, `ai.suggest.hire` or `ai.suggest.price_rise` (revision 25, P12; `agent.js@319ac100:5075-5077`). A tap asks it | Each chip 44 |
| 810 to 854 | **Tools row** (revision 23, M1), shown in every state of the sheet as the shipped toolbar is: M secondary buttons with a leading 20 icon, sized to their labels, 8 apart: `ai.calculator` (`dialpad`, x 20 to 160.1 in EN), which opens the shipped calculator above the composer with `ai.calculator.use` to put its result in the field (`agent.js@319ac100:5190-5209`); and `ai.attach` (`upload`, x 168 to 280 in EN), which attaches a photo or a PDF for `/api/ai/vision-inspect`, named `ai.attach_a11y` (`assets/agent-vision.js@319ac100:1-13`). Widths in §6.6 | Each 44 |
| 866 to 914 | Composer above the safe area (922): field min-height 48 at x 20 to 364, capsule, placeholder `ai.placeholder`; **the mic** (`mic`, icon button 44, ink-1, `ai.voice.dictate`) inside the field's trailing end at x 316 to 360, y 868 to 912, so the text runs from 36 to 312. **Primary icon** send (`send`, mirrored in AR, `ai.send`) at x 376 to 420, y 868 to 912. **Disabled until text is entered, painted as §10.1's disabled state: surface-3 fill, ink-3 icon**, never a faded accent | Field 866 to 914; mic 44 inside it; send 12 to its side |

**Card arithmetic:** 16 + 18 + 4 + 48 + 8 + 44 + 16 = 154, inside the 154 band.

**States:**
- Thinking: 3 skeleton lines, `aria-busy`, `ai.thinking`.
- Streaming: text appended with no fake cursor; announced politely when complete.
- Error banner: `ai.error` with "Try again".
- Unknown: `ai.unknown_costs`.
- Demo capsule in the header.

**Kept from the shipped assistant (revision 23, M1).** The round 23 critique found that revision 22 dropped three live features without saying so. Every shipped feature of the assistant has a home, listed in §12's table of shipped functions; the frame draws the mic, the Action Center, the calculator, the attach button and the two simulators. No function of the assistant is removed: the hero's margin sentence goes, and its margin and break-even figures stay reachable (§12, revision 25, P12); its greeting hero gives way to the intro and the Today card. For a store whose costs are not set up yet, the shipped hero shows three other cards in place of its hire, price and accounting cards (`agent.js@319ac100:1444-1447`, `:1502-1503`, `:1514`). Rows 4 and 5 here do the same: `ai.suggest.features` and `ai.suggest.setup`, the questions the first two cards send while `window.KiwiFeatureGuide` is loaded (`:1502-1503`). Row 6 is the operational status card's question, `ai.suggest.ops.*` for the store's trade family as `operationalHero()` picks it (restaurant and café, pressing, the five shop trades, other; `agent.js@319ac100:1465-1469`), the shipped questions as they are (`:1460-1463`). As in rows 1 to 5, the row draws the question only, not the card's title and subtitle. The frame draws the costs-set-up store (its rows 4 and 5 are hire and price rise), so it needs no new drawing; on a store without costs the group grows by one row of 52, still above the tools row at 810.

**The first card is the shipped Home recommendation (revision 24, M2).** Shipped Home carries "Kiwi Insights · Recommandations du jour" with three chips and its own input (`dashboard.html@319ac100:4963-4997`). It moves here, not to Home, for three reasons. On a real store the shipped card is a summary of the day, counted from the store's sales (`buildRealHeroRec`, `assets/dateRange.js@319ac100:2092-2112`), which is the Today card's job. Its average basket and card share are Home tiles, and its best hour is in Report's day report ("Rhythm of the day", `assets/day-report-dash.js@319ac100:126`, `:570`). Its chips and its input are a conversation, which Kiwi AI holds with a source on every figure. And Home keeps one key figure and no second voice (§18.1).
- **When `KiwiInsights.heroRec` returns a lever** (a store whose menu has dish costs and a month of units, `insights.js@319ac100:121-125`; on shipped Home that is the demo venues, `venues.js@319ac100:4987-5022`), the first card shows it in the Today card's place and geometry: the eyebrow `ai.insight.eyebrow` with its basis, `ai.insight.measured` or `ai.insight.estimated` (shipped `insights.js@319ac100:36-40`), then the lever's title, observation and action. These three sentences are generated from the store's figures by `insights.js` in each language (`:45-100`), as an answer is, so they are not keyed strings. The source chip names the records the lever was computed from. The assistant's advice intent reads the same engine (`agent.js@319ac100:1238`), so a follow-up question gets the same facts.
- **Otherwise** it is the Today card the frame draws. The worked example's menu holds prices and no dish costs (§18.0), so `heroRec` has nothing to rank.
- **The chips** are rows 1 to 3 below, the trade's own questions, as the shipped chips are (next paragraph). **The input is the composer, and its mic is the shipped hook:** `agent-voice.js` wires the mic onto the dashboard's `.hai-input` (`agent-voice.js@319ac100:270`). Here the composer is the one input, so that binding moves to it: one input, one mic, with the states above.

**Rows 1 to 3 follow the trade (revision 25, M1).** Shipped Home swaps its three chips per trade through `getVocab('aiChips')` (`assets/venues.js@319ac100:2078-2093`, applied in `renderHeroAi`, `assets/dateRange.js@319ac100:2601-2625`): a store's base trade picks the list, so a shop, a pressing and the other shop trades get `boutique`'s (`:974-976`), a spa `spa`'s (`:997-999`), a hotel `hotel`'s (`:1020-1022`), and a restaurant, a café and a trade without a list keep the restaurant questions. Rows 1 to 3 are those lists as keys, `ai.suggest.restaurant`, `.boutique`, `.spa` and `.hotel`, chosen the same way, so no shop is offered "dishes". Measured in Body (§6.6), each of the twelve questions holds one line at factor 1 in the group's 368 (the longest, FR "Prévision des encaissements cette semaine", is 324.1); at larger sizes a row wraps to two lines and grows, as every list row does (§10.8). Row 6's `ai.suggest.ops.*` follows the trade family as before.
- **The shop frame** (the preview's second Kiwi AI frame): Atelier Lina, a new shop whose costs are not set up, with no sale yet today. So it has no Today card: `ai.try` at 272 to 290, then six rows of 52 at 298 to 610, `ai.suggest.boutique`'s three, `ai.suggest.features`, `ai.suggest.setup` and `ai.suggest.ops.boutique`. The tools row and the composer stay at 810 and 866. The Action Center shows its label and no badge, since nothing waits for this store. Check 20 compares both frames' rows with the trade and the costs state the fixture gives them (§18.0).

**The mic** (`assets/agent-voice.js@319ac100`, kept in function):
- Press to record; press again to stop. Recording stops on its own at 60 s (`:28`). While it records, the button draws `stop_circle` in danger ink with `aria-pressed="true"`, named `ai.voice.stop`; no pulse, because the glyph and its colour already say it.
- Transcribing: the button is `aria-busy`, named `ai.voice.busy`, and ignores presses. The text lands in the field for the merchant to read and send; it is never sent by itself (`:115-131`).
- **Signed out (a 401):** `ai.voice.auth`, and every later press in the session shows it again without recording (`:37`, `:211`, `:234`).
- **Fallback (a 503 `unbound` or a 429 `quota`):** `ai.voice.fallback` when this browser has speech recognition, and every later press in the session records through it (`:34`, `:207-209`); `ai.voice.down` when it has none. The native app never falls back, because its consent names Cloudflare (`:87`), so it shows `ai.voice.down`.
- Other answers, as shipped: `ai.voice.denied` (microphone refused), `ai.voice.nothing`, `ai.voice.failed`, `ai.voice.offline`, `ai.voice.unavailable` (no recorder and no recognition), `ai.voice.interrupted`. Each shows as a toast (§10.17).
- The mic fires no haptic: recording is not a commit (§15).

**The Action Center** (`assets/agent-action-center.js@319ac100`, kept in function): a sheet over Kiwi AI, title `ai.actions.title`, subtitle `ai.actions.subtitle`. One card per entry, pending first, then newest: the proposal as the assistant said it, its status word (`ai.actions.status.*`) and whether it can be undone (`ai.actions.reversible` or `ai.actions.final`). A pending entry carries `ai.actions.confirm` and `ai.actions.reject`; a completed entry that can be undone carries `ai.actions.undo`, which restores the prior state and records `ai.actions.restored` on the entry (`:183`). Confirming and rejecting run through the same `KiwiAgentActions` path as shipped; undo exists only for a stock adjustment, and for an order status whose prior status the validator accepts (`:116`). A proposal's token lasts 120 s. Confirming after that renews it once, with the same arguments. If the renewal answers `replayed`, the entry is approved with the result that answer carries, and `ai.actions.expired` is written as its detail (`:159`). If the renewal is refused, the entry fails with the renewal's reason, or `renewal-refused` when it gives none (`:160`). If the renewal returns a new token, that token is confirmed and the entry settles on its result, with no `ai.actions.expired` written; a second expiry fails the entry (`:161-165`). Empty: `ai.actions.empty`. Confirm and undo fire Commit (§15.1); reject fires nothing.

**The placeholder** holds one line in the 276 the mic leaves: `ai.placeholder` is now "Ask about your sales" (EN 154.3, FR 258.0, AR 120.2, §6.6). Revision 22's "Ask about your sales, stock or team" measured 469.8 in FR, over even the 312 the field had before the mic; the suggestions name the other subjects.

**Type steps:** Heading, Body, Callout (source chip), Footnote = **4**. **Principle 1:** 1 primary (the primary icon send) ✓.

### 18.7 Kitchen wall · 1920 × 1080 TV (dark, root 24 px, Touch mode, EN, the worked example)

At the M root (24 px) the steps are: Display 66, Title 42, Heading 30, Body 25.5, Callout 22.5, Footnote 19.5. The kitchen grid is margins 24, gaps 16, full width (§7.2).

**Header**, y 0 to 88:
- station segmented (kitchen, 56, radiogroup) at x 24, **five segments** (`kds.all`, `kds.station.*`): "All 9 · Hot 7 · Cold 2 · Pastry 2 · Drinks 4". A sixth station would turn it into a scrolling track (§10.6).
- trailing: mint live dot 12, `kds.live` (Callout ink-2), clock "17:39" (Title, tabular).

**Counts are defined:**
- "All" counts active tickets (New + Preparing): 3 + 6 = 9.
- A station counts the active tickets that hold at least one of its items (§18.0 lists them). A ticket can belong to several stations, so station counts overlap and are not summed.

**Lane heads**, y 100 to 136 (Callout strong ink-2): `kds.new` 3, `kds.preparing` 6, `kds.ready` 2.

**Lanes**, y 148 to 1056 (908 tall), margins 24, gaps 16:

| Lane | x | Content |
| --- | --- | --- |
| New | 24 to 408 | 1 column of 384 |
| Preparing | 424 to 1608 | 3 columns of 384 |
| Ready | 1624 to 1896 | 272, compact: number (Title), source (Callout), item action `kds.mark_served` (K, 240 wide inside 16 padding) |

**Ticket anatomy and heights** (384 wide, radius 20, surface-1), every figure derived from the steps above:

| Part | Content | Height |
| --- | --- | --- |
| Header | padding 12; row 1: number (Display, 66 × 1.05 = 69.3) and timer (Title, `Just now` under 1 min), row 70; gap 4; row 2: source capsule (surface-3, Callout strong 22.5 × 1.35 = 30.4, padding 4 and 4, min-height 40: "Table 4", "Takeaway", or `two_wheeler` with "Glovo 3412") and the state word; padding 12 | 12 + 70 + 4 + 40 + 12 = **138** |
| Divider | line-strong | 1 |
| Items block | padding 8 above and below | 16 |
| Each item | qty in a 48 × 48 surface-3 box (Heading, tabular); name (Body strong, 25.5 × 1.4 = 35.7, wraps); each modifier adds a Callout ink-2 line (30.4) | **56** per one-line item |
| Note or allergen | warning-tint row, `warning` 32, Body strong ink-1, padding 8, never truncated | 8 + 35.7 + 8 = **52** |
| Footer | padding 12, item action K 64 (`kds.start` or `kds.mark_ready`), padding 12 | **88** |

So a full ticket is 243 + 56 per item + 52 per note: **299** with one item, **355** with two, **463** with three items and a note. A **compressed** ticket is the header, the divider, one `kds.compressed` line (Body 35.7 + 2 × 4 = 44) and the footer: 138 + 1 + 44 + 88 = **271**. The **newer** card is **88**. Revision 3's 192 and 304 were not derivable and are withdrawn.

**Frame contents (the overflow pass of §13.6, run on §18.0):**
- **Preparing**, 3 columns:
  - column 1: **42** (Table 22, 18 min, **late**: danger-solid header, a 3 px danger-solid frame, `error` and `kds.late`; "1 Tajine agneau pruneaux", note row "Nut allergy: no almonds", "1 Zaalouk", "2 Harira"; `kds.mark_ready`), 463; then **43** (Glovo 3412, 12 min, warning-solid header with `timer`), 355. 463 + 16 + 355 = 834 ≤ 908, and 44 (299) would need 1,149, so it starts column 2;
  - column 2: **44** (Table 4, 11 min, warning, "1 Harira"), 299; **45** (Table 12, 6 min, calm), 355: 670; 46 would need 1,041, so it starts column 3;
  - column 3: **46** (Takeaway, 5 min), 355; **47** (Glovo 3415, 4 min), 299: 670.
- **New**, 1 column: **48** (Glovo 3416, 2 min) full, 355, leaving 537 after its gap; **49** (Table 12, 1 min) full, 355, leaving 166 after its gap; **50** (Takeaway, Just now) fits neither full (299) nor compressed (271), so it starts the newer card, `kds.newer` "+1 newer" (88 ≤ 166). Start is the action on 48 and 49.
- **Ready:** 40 (Table 2) and 41 (Takeaway), compact cards of 12 + 49 + 4 + 31 + 8 + 64 + 12 = 180 each.

**Overflow and bump-bar behaviour:** §13.6.

**Contrast:**

| Pair | Ratio |
| --- | --- |
| Danger header text | 5.12 |
| Warning header text | 9.61 |
| Note | 11.90 |
| Items (ink-1 on s1) | 15.60 |
| Modifiers (ink-2) | 8.90 |
| Late frame vs s1 | 3.42 |
| Divider | 3.69 |

**Type steps:** Display, Title, Heading, Body, Callout = **5**. **Principle 1:** 0 primaries; item actions inside `[data-k-collection]` ✓. **Haptics:** none (§15.6).

### 18.8 Onboarding (one flow, web-drawn on every platform)

This replaces the native five steps (`native-shell.js:296`) plus the web wizard's six (`assets/onboarding.js`). **Sign-up and sign-in are separate screens.**

| # | Screen | Asks | Rules |
| --- | --- | --- | --- |
| Welcome | `ob.welcome` (Title) | Nothing. Primary "Create an account"; secondary "Sign in" | Language globe in the nav bar; follows the system theme |
| A1 · Create (`ob.step` 1 of 5) | `ob.create` | `ob.name`, `ob.business`, `ob.email`, `ob.password` (with `ob.show_password`) | Native labels, no fake placeholders, errors inline. **The password rules are visible before submit**: `ob.pw.rules` is the password field's helper text from the first frame, and it stays until an error replaces it. Every server answer has a state below |
| A2 · Sign in (no step count) | `ob.signin` | `ob.email`, `ob.password`; Plain `ob.forgot` (the self-serve reset, R1 below) | Every answer of `POST /auth/login` has a state (table below). **An existing owner on a new device** goes straight to "Set up this device" (step 5), because the account already has a business type and a personal code. An account with several venues first picks the venue (list rows) |
| 2 | `ob.kind` | One choice: 6 common types as 2-column tiles (icon 24, Body strong), plus "Show other types" opening a searchable list of all trades | **Nothing selected.** Continue disabled until a choice is made |
| 3 | `ob.goals` (revision 24, M2: the shipped goals step, kept) | Subtitle `ob.goals_sub`; the eight `ob.goal.*` chips, any number of them (each a toggle, `aria-pressed`, with its shipped Material icon); then `ob.daily_goal`, an amount field with MAD as its unit, optional, written to the venue's daily goal that Home's goal line and Settings › Business read | Nothing is required: Continue is enabled from the first frame. A value the shipped check refuses (`onboarding.js@319ac100:577-585`, `:591`) shows `ob.err.goal` under the field |
| 4 | `ob.code` | 4 digits on the PIN pad, then `ob.code_again` | Subtitle `ob.code_sub`. A mismatch shows `ob.code_mismatch` and restarts the step |
| 5 | `ob.device` | One of: "Run the till here" · "Use as kitchen screen" · "Use as team device" · "Use the dashboard only" | Nothing selected. Details below |
| End | Primary "Start using Kiwi" | n/a | The till's first open asks for the opening float through the cash count (§18.9) |

**A1, one state per answer of `POST /auth/signup`** (`functions/auth/signup.js`):

| Answer | Where it shows | Field focus | Copy key |
| --- | --- | --- | --- |
| 400 `email` (invalid, or over 254 characters, `:17`, `:27-30`) | Error under E-mail | E-mail | `ob.err.email` |
| 400 `name` (empty after trimming, `:31-34`) | Error under Your name | Your name | `ob.err.name` |
| 400 `weak`, reason `short` (under 10 characters, `_lib.js:94`) | Error under Password, replacing the helper | Password | `ob.err.pw_short` |
| 400 `weak`, reason `long` (over 1,024, `PASSWORD_MAX`, `_lib.js:13`, `signup.js:18`) | Same | Password | `ob.err.pw_long` |
| 400 `weak`, reason `common` (a common password, all digits, or one repeated character, `_lib.js:100-108`) | Same | Password | `ob.err.pw_common` |
| 400 `weak`, reason `personal` (contains the e-mail's local part or the business name, 4 characters or more, `_lib.js:110-118`) | Same | Password | `ob.err.pw_personal` |
| 409 `exists` (`:45`, `:92`) | Error under E-mail, with a Plain `ob.signin` that opens A2 with the e-mail filled | E-mail | `ob.exists` (copy #6) |
| 409 `business-taken` (`:77`) | Error under Business name | Business name | `ob.err.business_taken` |
| 429 (the signup limiter, `:19-20`) | Banner above the primary; the primary is disabled for `retry_after`, counted down in minutes | none | `ob.err.rate` |
| 503 `not-configured` (`:13`) or `rate-limit-unavailable`; 400 `bad-json` (`:16`, unreachable from the form) | Banner above the primary; the primary stays enabled | none | `ob.unavailable` |
| Network error | Banner above the primary; every field keeps its value | none | `ob.offline` |
| 200 | Step 2 (`ob.kind`) | | |

The client also checks length and e-mail shape before submitting, with the same keys, but the server's answer is the one that decides; the client never claims a password is strong.

**A2, one state per answer of `POST /auth/login`** (`functions/auth/login.js`, read at `31c94529`):

| Answer | Where it shows | Field focus | Copy key |
| --- | --- | --- | --- |
| 401 `bad-creds` (wrong pair, an unknown address, or an over-long input, `:16-19`, `:51-54`) | Error under Password; the password clears, the e-mail stays | Password | `ob.wrong_password` |
| 429 `too_many_attempts` with `retry_after` (`_lib.js:1193`), from either limiter: the **network** counter (`:29-30`) or the **account** counter (`:32-34`) | Banner above the primary; the primary is disabled for `retry_after`, counted down in minutes | none | `ob.err.signin_rate`, which names neither cause, because the answer does not say which counter tripped (revision 4's "from this network" was wrong for the account counter) |
| 503 `not-configured` (`:8`), `auth-unavailable` (`:45`), `rate-limit-unavailable` (`:52`, `_lib.js:1234-1236`); 400 `bad-json` (`:11`, unreachable from the form) | Banner above the primary; the primary stays enabled | none | `ob.signin_unavailable` |
| Network error | Banner above the primary; both fields keep their values | none | `ob.offline` |
| 200 | The owner's next step: Set up this device (step 5) on a new device, the venue list for several venues, or the dashboard | | |

**R · Forgot and reset password (self-serve, shipped in `816bd764`).** The account gate already links to it (`ob.forgot`, `functions/_middleware.js:707`, `:719`, `:731`), and the request form ships in `reset.html:246-292`. This direction redraws the same flow in the kit and keeps its routes and its no-oracle rule: the request answers the same for a known and an unknown address (`functions/auth/forgot.js`, header), so no screen ever says whether an account exists.

| Screen and state | Trigger (route and answer) | Shows | Copy keys |
| --- | --- | --- | --- |
| R1 · Request | `ob.forgot` from A2 or the gate | Title, body, the e-mail field (prefilled from A2 when it holds a valid address), primary L `ob.forgot.send`, Plain `ob.forgot.back` | `ob.forgot.title`, `ob.forgot.body`, `ob.email`, `ob.forgot.send`, `ob.forgot.back` |
| R1 · invalid address | Client check, or 400 `bad-email` (`forgot.js:111`) | Error under E-mail; not counted by the server | `ob.err.email` |
| R1 · sending | `POST /auth/forgot {email}` in flight | The primary's loading state (§10.1) | |
| R1 · too many | 429 `too_many_attempts` (network or address counter, `forgot.js:114-117`) | Banner above the primary, primary disabled for `retry_after` | `ob.forgot.rate` |
| R1 · unavailable | 503 `not-configured` (`:104`) or `rate-limit-unavailable` (`:120`); 400 `bad-json` | Banner; primary enabled | `ob.forgot.unavailable` |
| R1 · offline | Network error | Banner; the field keeps its value | `ob.offline` |
| R2 · Link sent | 200 `{ok:true, mail:true}` (`MAIL_WEBHOOK` is set) | Title and body that never confirm the account exists; Plain `ob.forgot.back` | `ob.forgot.sent_title`, `ob.forgot.sent_body` |
| R3 · Mail unavailable | 200 `{ok:true, mail:false}` (no `MAIL_WEBHOOK`; `forgot.js` then makes no token at all, `:122-127`) | Title and body that send the merchant to support; primary L `ob.forgot.support` (the support page's password section, as `reset.html:256-262` does); Plain `ob.forgot.back` | `ob.forgot.no_mail_title`, `ob.forgot.no_mail_body`, `ob.forgot.support` |
| R4 · Checking the link | The link opens `reset.html?token=…`; `GET /auth/reset` (`reset.js:69-75`) | A skeleton of the form with `ob.reset.checking` announced. A 503 here (`reset.js:71`) shows `ob.reset.check_failed` "Couldn't check this link. Try again." with `action.try_again`, which repeats the GET (revision 9, P1: `ob.reset.failed` talks about a password nobody has typed yet); a network error shows `ob.offline` with the same button | `ob.reset.checking`, `ob.reset.check_failed`, `ob.offline` |
| R5 · Invalid or expired link | GET answers `valid: false`, or POST answers 400 `invalid` (`reset.js@a3de3011:110`, `:122`, `:123`, `:130`): used, expired or unknown, **or a database fault while the token was being consumed**, which `:123` also answers as 400 `invalid` (revision 8, the F2 rider). The copy is written to be true in all four cases (`ob.reset.dead_title` "This link can't be used", `ob.reset.dead_body` naming each), and the cure is the same: a new link | Title, body, primary L `ob.reset.again`: **one tap** when this device remembers the address it asked from (below): it posts `/auth/forgot` with it, shows the primary's loading state and lands on R2 or R3 by the answer, with `ob.reset.again_hint` under the button; otherwise it opens R1 | `ob.reset.dead_title`, `ob.reset.dead_body`, `ob.reset.again`, `ob.reset.again_hint` |
| R5 · update failed, link lost (revision 8, F2) | POST answers 500 `update-failed` **without** `retry` (`reset.js@a3de3011:145`): the password write failed and the hand-back of the token did not change the row or threw (`:138-144`), so the token stays spent and the password is unchanged. This is what `reset.html@a3de3011:327` sends to its dead-link state | The R5 screen with `ob.reset.used_body` in place of `ob.reset.dead_body`, and the same one-tap `ob.reset.again`. The new password is not kept | `ob.reset.dead_title`, `ob.reset.used_body`, `ob.reset.again`, `ob.reset.again_hint` |
| R6 · New password | GET answers `valid: true` | Title, the two password fields with `ob.show_password`, the rules visible as helper text from the first frame (`ob.pw.rules`, as on A1), primary L `ob.reset.save` | `ob.reset.title`, `ob.reset.new`, `ob.reset.confirm`, `ob.pw.rules`, `ob.reset.save` |
| R6 · mismatch or short | Client checks before sending | Error under the second field (mismatch) or the first (under 10) | `ob.reset.differ`, `ob.err.pw_short` |
| R6 · weak | 400 `weak` with reason `short`, `common`, `personal` or `long` (`reset.js:84`, `:106`; the same `passwordProblem` as sign-up, `_lib.js:92`) | Error under the first field, replacing the helper, as on A1 | `ob.err.pw_short`, `ob.err.pw_common`, `ob.err.pw_personal`, `ob.err.pw_long` |
| R6 · not configured | 503 `not-configured` (`:79`), answered **before** the token is read or consumed, so the link still works | Banner above the primary; fields keep their values; primary enabled | `ob.reset.failed` |
| R6 · malformed request | 400 `bad-json` (`:82`), also before the token is read: a page bug, never a user error | The same banner; fields keep their values; primary enabled. `reset-states-test` posts a malformed body once to prove the route | `ob.reset.failed` |
| R6 · update failed, same link (revision 8, F2; shipped) | 500 `{error:'update-failed', retry:true}` (`reset.js@a3de3011:145`), sent **only** when the hand-back `UPDATE reset_tokens SET used_ts = NULL WHERE selector = ? AND used_ts = ?` changed exactly one row (`:138-143`, `e5639388` and `a3de3011`), so the link works again. `reset.html@a3de3011:327` keeps the form open in this case | Banner above the primary, "Your password wasn't changed. Try again."; the fields keep their values; primary enabled; the same link is retried | `ob.reset.failed` |
| R6 · too many attempts (revision 6) | 429 `too_many_attempts` with `retry_after` in seconds, from the shared limiter on its `reset` domain (`reset.js:90-91`; the body is built at `_lib.js:1193`) | Banner above the primary with `ob.reset.rate`, and under it a live `ob.reset.retry_in` "Try again in 15 min" (minutes = `retry_after` / 60 rounded up, the PIN pad's rule, §10.2), counting down each minute; the primary is disabled until the time passes, then re-enabled without a reload; the fields keep their values | `ob.reset.rate`, `ob.reset.retry_in` |
| R6 · limiter unavailable (revision 6) | 503 `rate-limit-unavailable`, from either check: `limitCheck` at `reset.js:90-91` when the limiter's table cannot be read (`_lib.js:1186`, `:1195`), or `reset.js:109` when a failed attempt cannot be recorded (`rateLimitUnavailable`, `_lib.js:1234-1235`): the server refuses rather than allow unmetered guesses | Banner above the primary; fields keep their values; primary enabled, so the person can try again | `ob.forgot.unavailable` (the same words, "Reset isn't available right now. Try again in a moment.") |
| R6 · offline | Network error | Banner; fields keep their values | `ob.offline` |
| R7 · Done | 200 `{ok:true}`: the server signs the merchant in | A confirmation for `--k-dur-7`, then the dashboard (behind its lock) | `ob.reset.done` |

**The remembered address (revision 7, M2).** The reset page cannot learn the account's address from the token, by design (the no-oracle rule above). So R1, on a 200, stores the address it sent on this device only: `localStorage` `kiwiResetEmail` = `{email, ts}`, read back only while `ts` is under one hour old (the link's own life), and deleted at R7, at `ob.forgot.back`, and on any read past the hour. A link opened on another device (the phone that got the e-mail) has no stored address, and `ob.reset.again` opens R1 there. The stored value is the address the person typed, never an answer from the server, so it reveals nothing the page did not already hold.

No haptic anywhere in R: a reset is not a commit (§15.6).

**Step 5, how each device choice works without leaving an owner session where it should not be:**
- **Run the till here:** Kiwi creates a pairing code with the owner session (`POST /api/pair/create`, `pair/create.js`, 15 min TTL) and redeems it on this same device (`POST /api/pair/redeem`), so nothing is typed. The owner session stays, because the owner is operating this till; the dashboard on this device opens behind the dashboard lock. Below it, an optional "Connect a printer" row with a Plain "Set up later".
- **Use as kitchen screen:** the same create-and-redeem pairing, then the owner session is **signed out** of this device. `ob.kds_warning` is shown before Continue.
- **Use as team device:** the owner session is signed out, and the device shows the team sign-in (§18.10), where each person signs in with their own e-mail and personal code. `ob.team_warning` is shown before Continue. No route pairs a team device to an owner session, and none is added.
- **Use the dashboard only:** nothing else happens.

**Chrome:**
- `ob.step` ("Step 1 of 5", Footnote) with a mirrored progress bar.
- Back chevron 44 in the nav bar.
- Primary pinned in the bottom footer on every step.
- Each question is asked once: name and business are never asked again.
- The goals step is kept (revision 24, M2): revision 22 removed it with no decision recorded, which took away the only place a new merchant sets the daily goal.
- **Durations:** none promised.

**Type steps:** Title (welcome, PIN digits), Heading, Body, Callout (the banners, §10.12), Footnote = **5** (revision 8, F8: revision 7 left the banners out). **Banners, measured at their real width** (revision 9, P5). Onboarding is a full page on the SE, 375 − 2 × 16 = 343 wide, not a sheet; the banner spans it, so its message is 343 − 32 padding − 20 icon − 8 gap = **283** wide (Callout 500, Inter Tight and Plex Arabic, wrapped in a 283 box and counted). One-line widths, then lines at factor 1 and at 1.35, EN / FR / AR: `ob.reset.failed` 284.9, 343.6, 222.4: 2 / 2 / 1, and 2 / 2 / 2; `ob.reset.check_failed` 229.6, 272.9, 264.0: 1 / 1 / 1, and 2 / 2 / 2; `ob.reset.rate` 255.3, 243.0, 187.5: 1 / 1 / 1, and 2 / 2 / 1; `ob.forgot.rate` 313.6, 368.2, 270.6: 2 / 2 / 1, and 2 / 2 / 2; `ob.forgot.unavailable` 358.8, 529.6, 282.4: 2 / 2 / 1 (AR with 0.6 to spare, so `label-fit-test` treats it as a two-line string, never a one-line one), and 2 / 3 / 2; `ob.offline` 445.3, 549.1, 352.7: 2 / 2 / 2, and 3 / 3 / 2. The tallest is 3 lines at 1.35: 3 × 20.25 × 1.35 + 24 = 106 tall, and the page scrolls above its pinned primary like any onboarding step. A banner never truncates.

### 18.9 Cash count and Z report (till Close the till, and dashboard Cash and Z)

**Cash count**: an iPad form sheet **720** wide, the one width (§10.3): padding 24, a list column of **360** and a keypad column of **288** (keys 88 × 72, §10.25), gap 24 (24 + 360 + 24 + 288 + 24 = 720). On phone, a large sheet.
- Title `count.title` (Heading).
- **One row per denomination**, min-height 56, at every width, in two sections with a Footnote strong ink-2 label each: `count.notes` ("Notes": 200, 100, 50, 20) and `count.coins` ("Coins": 10, 5, 2, 1, 0.50, 0.20, 0.10). The row label is only the denomination, formatted by `KiwiFormat` with its unit (`count.denom`: "200 MAD", "0.50 MAD"; FR "0,50 MAD"; AR "0,50 درهم"), because the section already says note or coin; the accessible name keeps the full form (`count.row_a11y`, "0.50 MAD coin, 3 counted, 1.50 MAD"). The rows of both sections are one group (`data-k-group`).
- **Each row:** the label (Body); a **count field** (a button showing the count, Body strong, tabular, 72 wide, `count.row_a11y`); and the subtotal at the trailing edge (Body, tabular). **No steppers:** the keypad is always one tap away, a correction is "select the row, retype", and dropping them removes 22 controls and their roots (§20.6).
- **Widths at 360, measured in all three languages (§6.6):** 2 × 16 insets + label + 8 + 72 + 8 + subtotal ≤ 360, so the label budget is 360 − 32 − 16 − 72 − 96 = **144** with a subtotal budget of 96. The longest label is "0,50 MAD" at 76.4 (EN and FR) and the longest subtotal "6 000,00" at 70.5, so every row fits with 67.6 to spare. Revision 4's "Pièce de 0,50 MAD" measured 154.3 against its 120 budget and is withdrawn with the long labels.
- **Entering counts:** tapping a row's count selects that row (lens paint) and the keypad types into it. In count mode the keypad's decimal key becomes **Next** (`count.next`, `arrow_downward` 24), which moves to the next row. iPad: the keypad stays in its column. Phone: the keypad docks at the bottom of the sheet while a row is selected, replacing the summary, which returns when the keypad is dismissed. The docked keypad is outside the sheet's drag region (§10.3).
- **Effort:** the example below (8,902.00 MAD) takes 18 taps: one to select the first row, then the digits and Next for each of the seven rows that hold cash (3, 3, 3, 3, 2, 2 and 1). Rows left untouched count as zero.
- Plain `count.enter_total`.
- Sticky summary, with each line as a `data-k-part`:

| Line | Amount |
| --- | --- |
| Opening float | 500.00 |
| Cash sales | + 8,240.00 |
| (sub-line, Footnote ink-2, not a part) `count.cash_refunds_sub` | After 120.00 MAD refunded in cash |
| Cash tips (`count.cash_tips`, revision 6: the shipped expected includes them, `day-report.js:719`) | + 60.00 |
| Cash in | + 720.00 |
| Cash out | − 600.00 |
| **Expected** | **8,920.00 MAD** (Heading) |
| Counted | 8,902.00 (200 × 30, 100 × 20, 50 × 12, 20 × 12, 10 × 5, 5 × 2, 2 × 1) |
| Difference | **−18.00 MAD** in **Display** (44, tabular, the unit in Heading), sign always shown: the largest figure on the sheet (revision 8, F12) |

**Difference rules:**
- **It is the sheet's key figure** (`data-key-figure`), in Display, larger than the keypad's Title digits (28) and than Expected (Heading, 20), because the cash close exists to reconcile. Measured in Inter Tight: "−18.00" 145.1 + U+00A0 "MAD" 49.1 = 194.2, and the widest plausible "−9,999.00 MAD" 258.4 (AR 257.8), inside the list column's 328. Before the first entry the slot shows Expected in Display (labelled `count.expected`), so the reconciling figure is always the largest thing on screen, and **the summary's Expected row is hidden** (revision 9, P8: `visibility: hidden` with its height kept, and `aria-hidden`), so the figure is on the sheet once. From the first entry the slot crossfades (`--k-dur-2`) to Difference, labelled `count.difference`, and on the same frame the Expected row fades in on its Heading line; nothing moves, because its row kept its height.
- Shown only after the first entry.
- Neutral (ink-2) within the merchant's tolerance (default ±20.00 MAD); warning outside it; danger beyond 5× the tolerance.
- Reason chips (radiogroup) required only outside tolerance.

**Primary:** `count.close`. It is disabled until there is a count, with the reason `count.close_hint`. The whole act (count saved, shift closed, Z generated) fires **one** Paid haptic, on the frame the closing is committed, after the busy wait for the sales feed (§15.3; revision 18, P8); the Z response fires nothing.

**Opening float:** the same component at shift open, with the primary `count.open`. **Its key figure is the float being counted** (revision 9, P8): the Display slot shows the running counted total, labelled `count.opening_float`, "0.00 MAD" before the first entry (nothing is prefilled), and there is no Expected and no Difference at open, so nothing crossfades; the summary under it is only the counted lines (Commit haptic on the local write, the brief's "open till: impact medium"). A chip `count.same_as_last` ("Last float · 500.00 MAD", accessible name `count.same_as_last_a11y`) offers the previous opening float, which is what the shipped float chips remember (`rememberFloat`, `kiwi-caisse.html:17128`, called at `:17157`), not the previous close (8,902.00 in the fixture, which is the drawer before the cash is taken to the safe). It must be tapped; nothing is defaulted.

**Z report** (the sheet that follows):
- Title `z.title` "Z report 0147" (Heading; the number is the fixture's close state, §18.0).
- `z.day`: "Business day Monday 12 October · 05:00 to 04:59", built from the cutoff that Z recorded (§17.1).
- Sections:
  - Sales by method (lines sum to the total);
  - Refunds: card 45.00 (1), cash 120.00 (1), total 165.00; the cash one is the amount the Cash section's sub-line names, already inside cash sales;
  - Cancelled sales (count and amount);
  - Voided items;
  - Discounts;
  - VAT by rate;
  - Tips: card 140.00, cash 60.00, total 200.00, listed apart and not in sales (§10.26; the shipped day report keeps them apart, `day-report.js:645-646`);
  - Cash (the summary above);
  - `z.closed_by` "Closed by Othmane N. at 23:41" (the fixture's close state: the staff display name and the close time, §18.0).
  - Sales by method in the fixture: card 17,070.00 and cash 8,240.00, summing to the close total 25,310.00 (§18.0 check 11).
- Secondary `z.print` and `z.export`; primary `action.done`.
- Z history lists real closures from the ledger, with dates in the locale format.

**Type steps:** Display (the Difference, or Expected before the first entry), Title (keypad digits), Heading, Body, Callout (reason chips, when shown), Footnote = **6**, the brief's limit. **Principle 1:** 1 primary per sheet ✓, and the key figure is the largest text ✓.

### 18.10 Team app: sign-in and clock-in · iPhone 6.9 (light, EN)

**Sign-in, step 1: the e-mail** (`findEmployeeCredential`, §10.2):

| y | Element | Hit area |
| --- | --- | --- |
| 62 to 106 | Nav bar: trailing language globe at x 376 to 420 | 62 to 106 |
| 130 to 155 | `team.signin.title` (Heading) | |
| 171 to 189 | `team.email.label` (Footnote strong ink-2, native label) | |
| 193 to 237 | E-mail field, `type="email"`, `autocomplete="username"`, `enterkeyhint="next"` | 193 to 237 |
| Pinned 16 above the keyboard (or at 850 to 906 when it is hidden) | Primary L `team.signin.next`, disabled until the field holds a valid address, with `team.email.reason` as its reason | The button |

Return on the keyboard does what the primary does. **The pad is not on this screen**, so no digit can be sent without an e-mail.

**Sign-in, step 2: the code** (the §10.2 anatomy, in order):

| y | Element | Hit area |
| --- | --- | --- |
| 62 to 106 | Nav bar: back chevron (to step 1) at x 20 to 64; language globe at x 376 to 420 | 62 to 106 |
| 122 to 146 | 1 · Identity line: the e-mail (Body), centred | |
| 154 to 179 | 2 · Title `pin.title` (Heading) | |
| 183 to 201 | 3 · Subtitle `pin.sub.personal` (Footnote ink-2) | |
| 217 to 229 | 4 · 4 dots | |
| 237 to 257 | 5 · Message row (min-height 20) | |
| 273 to 625 | 6 · PIN pad, 4 rows of 76 keys with 16 gaps; keys at x 82 to 158, 182 to 258, 282 to 358 | Each key (one group) |
| 641 to 685 | 7 · Plain `team.edit_email` | 641 to 685 |

**Gaps:** 16, 8, 4, 16, 8, 16, 16, all tokens. The final digit sends `{action:'login', email, pin}`. Every answer has its state in §10.2. After 200 the app shows `pin.hello` and the venue returned by the server, then the Tables tab (no haptic, §15.1).

**Clock-in** (Me tab):
- `clock.in` is the Me tab's primary (L, bottom 40 %). When clocked in it reads `clock.out`, and a Footnote above it says `clock.in_since`.
- It opens a sheet: `clock.code.title` (Heading), `clock.code.sub` (Footnote ink-2), **6 dots**, the message row and the PIN pad. The pad is outside the sheet's drag region (§10.3).
- The final digit sends `{action:'clock-in'}` or `{action:'clock-out'}` with the attendance code. `attendance-code-invalid` covers both a wrong and an expired code, because the server does not distinguish them (`employee.js:494-497`), so the copy names both. A 429 pauses this person's attempts (`attcode` target, `employee.js:491-493`). An expired team session (401 `employee-session-required`, `:361`) shows `team.session_ended` with `action.sign_in`; a suspended store (403, `:369`) shows `access.suspended`.
- 200 fires **Shift** within 600 ms of the final digit (§15.1, §15.3: a person's shift opening or closing is a server verdict, so it is not Paid, which fires only on a local record).
- Breaks are not started here (§12).

**Type steps:** Title (keypad digits), Heading, Body, Footnote = **4**. **Principle 1:** step 1 has one primary; step 2 has none (the final digit submits); the Me tab has 1 ✓.

### 18.11 The smallest supported phone · Home on iPhone SE (375 × 667, light, EN)

| y | Element | Hit area |
| --- | --- | --- |
| 0 to 20 | Status bar | |
| 20 to 64 | Nav bar: the wordmark at x 16 (as on the 6.9); venue switcher at x 64; the Kiwi AI capsule (§18.1, revision 25, P13), x 204.1 to 307 (102.9 wide), 8 before Notifications at x 315 to 359. "Café Atlas" ends at 170.1, 34 before the capsule; a longer name ends in an ellipsis 8 before it, as on the 6.9. At 1.35 the capsule is 119.3, from x 187.7, and above 1.35 it is the glyph alone (§18.1) | 20 to 64 |
| 72 to 116 | Date button | 72 to 116 |
| 120 to 168 | Key figure "19,174 MAD" (Display + Heading): **194.1** wide ("19,174" 145.0 at Display, U+00A0 and "MAD" 49.1 at Heading, §6.6) | |
| 172 to 190 | Goal line, as on the 6.9 (revision 24, M2); with no goal set, `home.goal_set` takes its own 44 row, 172 to 216, and the rows below move down 26 (§18.1) | |
| 194 to 238 | Compare control, with its `expand_more` 16: one line in EN at factor 1 (304.5 of 343, gaps and `expand_more` included, §6.6) and at 1.12 (335.5); in FR one line at factor 1 (329.5) and the two-row form from 1.12 (363.5 needed), still inside the 44 hit height up to 1.24 (two Footnote lines, 35.1 at factor 1) | 194 to 238 |
| 246 to 290 | Range presets, x 16 to 359, segments sized to their labels (EN needs 281.9 of the 335 track, FR 281.7, AR 222.6, §6.6) | 246 to 290 |
| 306 to 426 | Chart, **120** tall (viewport < 800, §10.22): legend band 306 to 332, data 332 to 426 with the larger series' maximum on the top gridline at 332, labelled "30.1K" at x 343 (end-aligned, 21.5 baseline in the band, about 100 pt clear of the legend's end); the preview's SE frame leaves 17 pt between the legend's end and the nearest point of either line | 306 to 426 |
| 434 to 542 | Tiles row 1, two tiles of 165.5 × 108 with a 12 gap, 8 below the chart | 434 to 542 |
| 554 to 662 | Tiles row 2, which passes under the capsule | 554 to 662 |
| 597 to 659 | Tab capsule (no home indicator, so bottom = 667 − 8), items sized to their labels | 597 to 659 |

The first paint shows the key figure, the goal line, the baseline, the range, the chart and the first two tiles in full, all clear of the capsule: the tiles end at 542, **55** above it (≥ 8; floating chrome is not a gap in the flow, §7.1); the second row's top shows above the capsule as scroll content. Gaps in the flow: 8, 4, 4, 4, 8, 16, 8, 12. **Type steps:** 5, as on §18.1. The preview renders this frame.

---

## 19. Performance budgets and measurement

| Budget | Value | Measured by |
| --- | --- | --- |
| Interaction to next paint, iPhone 12, p75 | ≤ 200 ms for every interaction, **including Confirm payment to the paid moment's first frame, online or offline** (it waits for the local record, never the network, §10.26); ≤ 100 ms for add item, stepper, PIN digit, segmented | `tools/design-capture/` harness: from the event's `timeStamp` to the timestamp taken in a **second** `requestAnimationFrame` callback after the DOM commit. The first rAF runs before the frame is painted; the second runs after that frame is presented, so the figure covers paint and over-reports by at most one frame (16.7 ms). WebKit has no Event Timing API (§4.1) |
| Layout shift | ≤ 0.01 per load; 0 during interactions | Frame-diff of the capture (WebKit has no `layout-shift` entries); `PerformanceObserver` on Chromium as a cross-check |
| Frames during recorded transitions | ≤ 1 frame over 16.7 ms per transition; none over 33.4 ms | rAF delta log during the 60 fps recording |
| Long tasks during service interactions | None over 50 ms | rAF gaps (WebKit) or the `longtask` observer (Chromium) |
| Haptic latency | **Without owner decision 9:** p95 ≤ the stage 1 measured baseline + 5 ms per class (no regression). **With decision 9:** ≤ 20 ms p95. From the event `timeStamp` to the return of the native generator call, iOS only | The haptics trace (§15.5): `kiwi-haptics` returns `CACurrentMediaTime()` after the generator call, and a 20-call `clock()` handshake aligns the two clocks to within 2 ms. The baseline is measured in `stock` mode (identical to today's plugin) and written here at stage 1 |
| Kit JS core (elements, motion, haptics, format, ledger reader, lens) | ≤ 35 KB gzip | `check.js` size gate |
| Strings, per surface bundle and locale (§9.3) | `kit` ≤ 6 KB; `dashboard` ≤ 20 KB; `till` ≤ 18 KB; `team` ≤ 6 KB; `kds` ≤ 4 KB; `ordering` ≤ 6 KB; `onboarding` ≤ 4 KB (gzip) | Size gate per file. **Basis, measured at `31c94529`** (`gzip -9`, revision 8, F7): `assets/i18n.js` is 34,611 B gzip for the dashboard's EN and AR dictionaries (about 17.3 KB per locale); `assets/caisse-lang.js` is 46,794 B gzip for French keys with EN and AR values on the boutique register (about 15.6 KB per language). Revision 7 printed 34,619 and 46,058, the second from `f249411e`. A page loads `kit` plus its own bundle in one locale: 26 KB on the dashboard, 24 KB on the till |
| Kit CSS (inside the shadow roots) | ≤ 18 KB gzip | Size gate |
| Shadow roots per page | ≤ 60 (the §20.6 counts are 4 to 8 per hero frame) | Census in the capture (§20.6) |
| First render of a 200-tile menu, iOS 15.8 on the oldest supported iPhone (6s) | ≤ 16 ms of style recalculation, ≤ 50 ms total | Capture harness on device, stage 2 gate |
| Icon sprite per surface | ≤ 25 KB gzip | Size gate |
| Latin font | ≤ 60,000 B woff2 (§6.1) | Size gate on the built file |
| Arabic font | Loaded only in AR, ≤ 3 × 46,000 B (measured 42,848 to 45,688 B); 700 only under Bold Text (44,280 B) | Size gate |
| Guest ordering, cold, slow 4G | LCP ≤ 2.5 s; JS ≤ 60 KB gzip | Capture run |

The round evidence pack carries these traces. A budget miss fails the round, as a rubric point would; for haptic latency, the gate is the one that applies (with or without decision 9).

---

## 20. Cascade isolation and coexistence

### 20.1 Why shadow DOM, not `@layer`
Verified: `assets/design-vexel.css` holds 257 `!important` declarations; 78 of its important rules are scoped `body.design-vexel` and 29 `:root[data-theme="dark"]`. The dashboard and till also carry large inline `<style>` blocks.

Under CSS Cascade 5:
- layered normal rules lose to **every** unlayered rule;
- unlayered important rules beat layered normal rules.

So a layered kit would lose on the legacy pages unless those pages' `<link>` and `<style>` tags were moved into layers, which edits shipped pages. The 15.5 floor makes `@layer` available, but that does not change the cascade arithmetic, so it stays unused.

**Decision:** kit components are custom elements with **shadow roots**. Page CSS cannot reach inside them. Only inherited properties and custom properties cross, under the host contract below. New surfaces style their page layout with `:where()` resets and single-class `.k-` selectors, and load no legacy CSS.

### 20.2 The host contract (`:host` reset and inherit list)

```css
:host {
  all: initial;                       /* page CSS cannot leak in */
  /* behaviour the page sets on ancestors and the kit must keep */
  visibility: inherit;                /* hidden legacy containers hide the kit (dashboard.html uses visibility:hidden at :1012, :1022, :3112, :4413) */
  pointer-events: inherit;            /* pointer-events:none containers stay inert */
  cursor: inherit;
  direction: inherit;
  color-scheme: inherit;              /* native radios, checkboxes, carets, scrollbars and autofill follow the page's theme */
  -webkit-text-size-adjust: inherit;  /* Dynamic Type on iPhone, §6.4 */
  -webkit-tap-highlight-color: inherit;  /* native-runtime.css:7 sets transparent on body */
  -webkit-touch-callout: inherit;
  -webkit-user-select: inherit;
  user-select: inherit;
  font-family: var(--k-font);
  color: var(--k-ink-1);
  display: block;                     /* each component sets its own display */
}
```

- `all` does not reset custom properties, so every `--k-*` token still inherits.
- **`color-scheme`** is reset to `normal` by `all: initial`, which would paint the native radio and checkbox (§10.24, §10.10), the caret, scrollbars and autofill in light colours on a dark page. It is in the inherit list, and `tokens-2027.css` sets `color-scheme: light` and `color-scheme: dark` on `:root` with each token set, so the page's scheme reaches every root.
- `touch-action` is not inherited in CSS, so `all: initial` cannot remove anything a parent set; the kit sets it on its own parts (`manipulation` on buttons and keys, `pan-y` on the chart).
- **Inside the root**, the kit's own controls also set `-webkit-tap-highlight-color: transparent`, `-webkit-touch-callout: none` and `user-select: none` explicitly (fields set `text`), because `native-runtime.css:18-19` reaches only light-DOM `button`, `[role="button"]`, `input` and their kin, never shadow content.
- **Arabic tracking** crosses as tokens: `html[lang="ar"]` sets every `--k-track-*` to 0, because the shipped `html.kiwi-native[lang="ar"] *{letter-spacing:0!important}` cannot reach shadow content.
- **`kit-in-host-test`** renders the gallery inside the `dashboard.html` and `kiwi-caisse.html` cascades, in both themes, and asserts:
  - every computed property of every internal part equals the bare gallery's, **including `font-family`**, which must be exactly `"Inter Tight", "Kiwi Arabic", "Inter Tight Fallback", system-ui` on an EN host and on an AR host (`html[lang="ar"]`, where the legacy `--sans` puts Plex first): the kit's stack from `tokens-2027.css`, never the host's `--sans` (§6.1, revision 9, M4). On the AR host it also measures the §6.6 AR guest chips at 310.6 and asserts that the digits in a kit root render in Inter Tight (`document.fonts.check` plus the measured width of `19 174`). **It also asserts that an Arabic word does not (revision 14, B1).** "مقعدان" at 400 17 px in a kit root on the AR host must measure what it measures in `"Kiwi Arabic"` alone, within 0.3 px: 51.69 in Chromium 152. Revision 13's stack gave 34.98, because Arial took every letter. So any face that claims Arabic before Plex fails here, whichever face it is;
  - each inherit-list property on a kit host equals its parent's: a kit element inside a `visibility:hidden` container is hidden, inside `pointer-events:none` it receives no tap, and its tap highlight, callout and selection match the native runtime's values;
  - **in dark**, the computed `color-scheme` of every internal native `<input>` is `dark`, and a screenshot of a checked radio and a focused field matches the dark baseline.

### 20.3 The shipped native feel layer is absorbed: every haptic call site

`app/src/native-runtime.js` defines `hapticLight` (`:204`) and `hapticNotice` (`:205`), exports `hapticLight` on the native bridge object (`:1921`), and calls them, or the plugin directly, at the sites below. At **stage 1** (behind the flag, in a native build) every site routes through `KiwiHaptics.play(class, gestureId)`, and each site gets the 2027 class or is removed:

| Line | Where | Today | 2027 |
| --- | --- | --- | --- |
| 677 | `finish`, horizontal panel swipe committed | raw impact Light | **Removed.** A panel swipe moves content under the finger and is not one of the brief's "tab, segment, pill change" rows; its destination tab's lens moves silently because the swipe is the gesture (§15.6). A **tap** on a tab still fires Choose (`native-runtime.js:1103`, `:1110`), as the brief's map says |
| 794 | `nativeWorkspaceAction`, open tools drawer | Light | Removed (opening a menu) |
| 868 | `mountNativeAccountGroup` tap | Light | Removed |
| 896 | `nativeMenuButton` opens a menu | Light | Removed |
| 1019 | `setMode`, floor view toggle | Light | Light, as shipped: the floor is not redesigned (§18.4) |
| 1023 | Floor table node tap | Light | Light, as shipped (§18.4) |
| 1103, 1110 | `activateNativeTab` (called by the native tab bar's `navigate`, `:1119`) | Light | Choose, the **only** haptic of a native tab change. Today a native tab tap buzzes twice (`KiwiNativeShell.swift:145` in `send()`, then this call); the Swift call is removed (table below), so it buzzes once |
| 1302 | Pairing pad key click | Light | Choose on pointerdown, and nothing when the host is the KDS |
| 1312 | Pairing gate error observer | Error | Failed on 422 within 600 ms; the observer is deleted |
| 1321 | PIN dots shake observer | Error | Failed on 401 within 600 ms; deleted (the pad calls it from the response) |
| 1322 | PIN success dot observer | Success | **Removed:** a successful code fires nothing (§15.1) |
| 1429 | `announce`, PIN wrong | Error | Same call as :L1321 today, so the shipped pad can buzz twice; one call remains |
| 1449 | `enter`, keypad key | Light | Choose on pointerdown |
| 1579 | `tryFace`, Face ID accepted | Success | **Removed**, like a successful code |
| 1593 | `mountFaceKey`, Face ID key | Light | Choose on pointerdown |
| 1640 | `enable`, biometrics switched on | Success | Adjust (a switch toggle) |
| 1741 | `openMenu` | Light | Removed |
| 1755 | `go`, menu navigation | Light | Removed |
| 1783 | `mountQuickActions` | Light | Removed with the Home quick actions (§22) |
| 1935 | `kiwi:native-haptic` listener | Light, or Error/Success by `kind` | Kept as an adapter until stage 7: `light` → Adjust, `success` → Paid only when the dispatcher passes a `gestureId` and `trigger: 'local-record'`, `danger` → nothing |
| 1936 to 1940 | `kiwi:toast` listener | Error or Success on every toast | **Deleted at stage 1** (toasts never buzz, §15.6) |
| 2032 | `release`, sheet drag dismissed | Light on release | **Removed:** sheet drags never buzz (§15.6) |
| 2089 to 2103 | `hcall`, `tick` (40 ms), `selectionTap` | Selection | Choose, through `KiwiHaptics`; the 40 ms throttle is kept |
| 2160 | Segment pointerup | `selectionTap` | Choose |
| 2169, 2182 | Chart scrub start and end | Bracket | Choose bracket |
| 2200 | Paid moment | Success (only when the event asks; the till passes `haptic: false`, `kiwi-caisse.html:11404`) | Unchanged in substance: Paid on the local record, fired once by the till, which dispatches `kiwi:sale-paid` with `haptic: false` so the runtime only draws |

**`app/src/native-shell.js`** (the native setup screens, retired into the web onboarding at stage 6, §18.8) has two more sites:

| Line | Where | Today | 2027 |
| --- | --- | --- | --- |
| 161 | `go(role)`, a setup role chosen | `KiwiNative.hapticLight()` | Removed with the native setup at stage 6; until then routed to Adjust through `KiwiHaptics` at stage 1 |
| 265 | Setup sign-in validation error | `kiwi:native-haptic` `{kind:'danger'}` | Removed at stage 1: a local validation error fires nothing, as `onboarding.js:633` (below) |

**Dispatchers of `kiwi:native-haptic`:**
- `assets/onboarding.js:633` (`danger` on a validation error): removed; a local validation error fires nothing.
- `assets/pages-pro.js:464` (print result): removed; printing is not a commit with a haptic.
- `kiwi-caisse.html:9899` (`light`, `nativeHapticLight`): Adjust, with a `gestureId` from the tap.
- `kiwi-caisse.html:9903` (`success`, `nativeHapticSuccess`): Paid on the local record (the payment and close-the-till call sites, `:11396`, `:11401`), and nothing from any other caller.

**The native host, `app/ios/App/App/KiwiNativeShell.swift`** (read at `31c94529`). It draws a second tab bar and native sheets for the web page (`__kiwiHostCaps={sheet:1}`), and calls UIKit generators directly:

| Line | Where | Today | 2027 |
| --- | --- | --- | --- |
| 145 | `KiwiNativeShellModel.send()`, every action the host posts to the page (tab `navigate` from `:819`, sheet answers, setup actions) | `UIImpactFeedbackGenerator(style: .light).impactOccurred()` on **every** send | **Removed at stage 1.** The page decides the class: a tab change reaches `activateNativeTab`, which plays Choose once through `KiwiHaptics`; a sheet answer plays the class of the act it confirms, or nothing |
| 334 | `presentSheet`, a native sheet with a `destructive` action | `UINotificationFeedbackGenerator().notificationOccurred(.warning)` on present | **Removed at stage 1.** The page plays Caution through `KiwiHaptics` before it requests a sheet that confirms a Tier B or C act, so the class is the same whether the sheet is web-drawn or native, and Principle 5's "one gesture, one haptic" holds |
| 936 | `runJavaScriptConfirmPanelWithMessage`, a `window.confirm()` whose text looks destructive | Warning before the alert | **Removed at stage 1.** `window.confirm()` is deleted from work surfaces (§22); until a surface adopts the kit, its destructive confirms are silent rather than buzzing on a text match |
| 803 to 825 | `KiwiNativeTabRoot`, the native tab capsule with `@Namespace selectionLens` and `matchedGeometryEffect` | A second lens, drawn by SwiftUI | **One lens owner per screen.** On a kit-adopted page the native capsule is not shown: the page posts `tabs: []` (as it already does for blocking layers and widths over 900, `native-runtime.js:1095-1096`) and the kit's `<k-tabbar>` draws the capsule with `assets/kit/lens.js`. On a page that has not adopted the kit, the native capsule stays and keeps its own lens until that page's stage. No screen ever shows both |

**`navigator.vibrate`**, 14 call sites (read at `31c94529`). iOS WebKit ignores the API, so today these buzz only on Android and in Android browsers; each is removed or routed:

| Site | Trigger today | 2027 |
| --- | --- | --- |
| `kiwi-cuisine.html:1652` (`announce`) | A new kitchen order arrives | **Removed.** Nothing on the KDS buzzes (§15.6); the new ticket is announced by sound and `kds.announce` |
| `kiwi-cuisine.html:1674` (`announceVoid`) | A voided line arrives | Removed (same rule) |
| `kiwi-cuisine.html:1860` (`showNotice`) | A kitchen notice shows | Removed (same rule) |
| `kiwi-caisse.html:22149` | The kitchen bumped a ticket to ready, seen by the till's poll | Removed: a live update (§15.6); the toast stays |
| `kiwi-serveur.html:7207` | A service notification arrives | Removed: a live update |
| `assets/orderpro-inbox.js:429`, `:490` | A new online order or an inbox alert | Removed: a live update |
| `OrderPro.html:5990` (`triggerReady`) | The guest's takeaway order is ready (guest page) | Removed: a live update on a guest page; the chime and the system notification stay |
| `kiwi-order.html:5233` (`triggerRejected`), `:5239` (`triggerReady`) | The guest's order was rejected or is ready | Removed (same rule) |
| `assets/pages-pro.js:5311` | A waiter added to or removed from a table's servers | **Routed:** Choose through `KiwiHaptics` (a chip toggle), on the confirmed tap |
| `assets/pos-boutique.js:2558`, `assets/pos-maison.js:3251` | A barcode scanned into the cart | **Routed:** Adjust through `KiwiHaptics` (an item added to the bill), on the frame the line is added |
| `assets/retail-scan.js:197` (`blip`) | A scanned quantity changed | Routed: Adjust, same reason |

After stage 1 the static scan in §15.6 finds no `navigator.vibrate` in the repo.

**Android** (`app/android`, the same web bundle and the same `@capacitor/haptics` 8.0.2 through `capacitor.settings.gradle:11-12`): there is no native shell on Android (`KiwiNativeShell.swift` is iOS only), so its haptics are exactly the web sites above, through `KiwiHaptics` and then `kiwi-haptics`, which plays the stock Android waveforms. The 14 vibrate sites are the only Android-only emitters, and they are gone at stage 1. Android latency is traced, not gated (§15.5).

**Other feel-layer parts** (`native-runtime.js:2062-2252`): `PRESSABLE` and `SEGMENT` exclude `[data-k]` hosts (also added to `OWN_PRESS`), so kit elements get exactly one press scale and one haptic. `EASE` becomes the `--k-glide` value; the release becomes `--k-dur-3`. The paid moment keeps its 1100 ms as `--k-dur-8`. At stage 7 the layer's press, ticks, paid moment and the adapter are deleted.

### 20.4 Events, ARIA and forms across the shadow boundary

- **Event contract.** A component reports every user action as one `CustomEvent('kiwi:action', {bubbles: true, composed: true, detail: {action, id, value}})` dispatched from its host. Revision 5 said `interactive.js` would route it to `Kiwi.handlers`; that is true only of the dashboard. The till, the waiter app and the kitchen do not load `interactive.js` (it is loaded by `dashboard.html:5495`, and by `brand.html`, `pitch.html` and `wallet.html`, none of them work surfaces), and each has its own dispatcher. Revision 5's claim that `Kiwi.handlers` holds `discount` and `pay` from the till and the waiter app is withdrawn: those are `data-action` values read by the till's and the waiter app's own listeners, never keys of `Kiwi.handlers`.
- **The real dispatcher on each surface** (read at `31c94529`):

| Surface | Today's dispatcher | How a kit action reaches it |
| --- | --- | --- |
| Dashboard (`dashboard.html`) | `assets/interactive.js`: the `handlers` map (`:1697`), exported as `Kiwi.handlers` (`:4909-4910`), called by the delegated click at `:4560-4566` (`handlers[a](actionEl, arg)`) | The router below forwards `k.*` actions to adapter functions registered by the dashboard's adoption code; an adapter may call an existing `Kiwi.handlers` entry by name |
| Till (`kiwi-caisse.html`) | Three listeners, no shared map: the document-level `if/else` chain on `act.dataset.action` at `:19045-19049` (`reassign-server`, `discount`, `edit-discount`, …), the per-button `.meta-btn` listeners at `:10839-10841` (`print-bill`; its comment says `discount` goes to the chain below), and the `.qa-btn, .act-pill` listeners at `:10963-10965` (quick actions, feature-gated) | The router calls adapter functions registered by the till's adoption code, which call the same functions those branches call today (`openRemiseModal(selectedId)`, `openVrapRemise()`, …). The legacy chain is not extended and not called by name |
| Waiter app (`kiwi-serveur.html`) | One listener on `#td-footer` (`:8758-8761`, footer at `:4569`), branching on `btn.dataset.action` (`take-order`, `pay`, …), after the reopened-bill guard at `:8763-8766` | The router calls adapters registered by the waiter app, and each adapter runs the same reopened-bill guard first, so a kit button cannot skip it |
| Kitchen (`kiwi-cuisine.html`) | No `data-action` at all: a document click listener at `:1977` keyed by `data-notice-ok`, `data-void-ack` and the ticket attributes, and the pairing pad's listener at `:1217` keyed by `data-k` (a different attribute that only shares the kit's prefix) | The router calls adapters registered by the kitchen. The pad's `data-k` keys are renamed to `data-pad-key` at stage 3b, before any kit element lands on that page, so `[data-k]` means "kit host" everywhere |

- **One router, `assets/kit/actions.js`, loaded by every surface that adopts a kit component.** It adds one `kiwi:action` listener on `document` and keeps a registry: `KiwiActions.on(name, fn)` registers an adapter (one per name; a second registration throws), and an action with no adapter is reported to `KiwiReportError` and shown nowhere. It never touches `Kiwi.handlers` or any `data-action` listener, so a surface keeps its legacy dispatcher until every control it serves has moved, and the dashboard needs no change to `interactive.js`. The CLAUDE.md §4 rule ("sweep the whole `Kiwi.handlers` map") is extended to "sweep the whole `KiwiActions` registry" for kit actions, and `kit-lint` lists, per surface, every `k.*` name a component can emit against the adapters registered on that page; a name with no adapter fails.
- **Namespaced names.** Every kit action is `k.<component>.<verb>` (`k.bill.discount`, `k.bill.pay`, `k.count.close`), from a documented list per component, so it cannot collide with a legacy `data-action` value such as the till's `discount` (`kiwi-caisse.html:6412`) or the waiter app's `pay` (`kiwi-serveur.html:8636`). `kit-lint` fails a kit action name without the `k.` prefix.
- **One path per action, never two.** A kit host may **not** carry a `data-action` attribute; `kit-lint` fails it. The three legacy dispatchers find their target with `closest('[data-action]')`, and a click inside a kit root retargets to the host, which has none, so they ignore it; the kit action arrives only through `kiwi:action`. `kit-in-host-test` clicks every kit control on each adopted page and asserts exactly one adapter call and zero legacy branch calls.
- **Open roots.** Every kit root is `attachShadow({mode: 'open'})`, so tests, the target audit and assistive tooling can reach inside. puppeteer-core's `>>>` and `pierce/` selectors pierce open roots; `page.evaluate` checks use `deepQueryAll` (§2).
- **Composed native events.** `click`, `input`, `change`, `focus` and `keydown` already cross the boundary (they are composed); `change` from a kit field is re-dispatched by the host with `composed: true` so legacy listeners see it.
- **ARIA.** ID references (`aria-labelledby`, `aria-describedby`, `aria-controls`, `for`) never cross a root: a label and its control, a dialog and its title, a disabled button and its reason, a tablist and its panels are rendered in the **same** shadow root. Where a page needs to name a kit control, it sets the host's `label` attribute, which the component copies into its internal `aria-label`.
- **Forms.** No `ElementInternals` (§4.1). Kit fields are not submitted by a page `<form>`; they expose `name` and `value`, and the sheet or page that owns them reads values on its primary. Inside a kit sheet the native `<form>` lives in the same root as its native inputs, so Enter and validation work natively.
- **Disabled.** The host's `disabled` attribute is reflected onto the internal native control (§10.1); the host also sets `aria-disabled` for assistive technologies that read the host.

### 20.5 One lens module
- `assets/kit/lens.js` is **the** lens. It attaches to light-DOM tracks (`[data-kw-lens]`, `data-lens-demo`, `data-lens-item`, as today) and is called by kit components for tracks inside their own shadow roots.
- **The global name is the shipped one, extended, not a second object.** `assets/liquid-lens.js:215` already publishes `window.KiwiLens = {rescan, refresh}`, and callers rely on both. `assets/kit/lens.js` takes over that object: it keeps `rescan()` (re-scan the document for tracks) and `refresh()` (re-place every lens) with their current meaning, and adds `attach(track)` (for a track inside a kit shadow root) and `move(track, index, {phase})` (the two-phase move of §14.3). It assigns with `Object.assign(window.KiwiLens || (window.KiwiLens = {}), {…})`, so whichever file loads first, there is one object with four methods. `kit-lint` fails any other assignment to `window.KiwiLens`.
- At stage 2, `assets/liquid-lens.js` becomes a short adapter that imports nothing new: its scan and placement bodies call `KiwiLens.attach` and `KiwiLens.move`, and its line 215 is removed because the kit file now owns the object. No surface has two lens implementations at once.
- The shipped transition list (`liquid-lens.js:74`: `transform .31s SPRING, width .31s SPRING, top .15s ease, height .15s ease`) becomes `transform` and the one length property for the track's direction, both `--k-spring` over `--k-dur-4` (§14.4). `top` and the 150 ms `ease` are gone. The stretch timer (`liquid-lens.js:154-160`) becomes `--k-lens-stretch` (115 ms), read once from the computed style, so the two phases of §14.3 are tokens rather than literals.
- The `kw-lens--brand` gradient variant is retired with the other selection styles (§1).
- **Stage 7 deletes `assets/liquid-lens.js`** (listed in §21.1).

### 20.6 Styles per shadow root, and controls inside collections
- **Collection rule:** a collection is **one** custom element with **one** shadow root. `<k-menu-grid>` renders 200 tiles as plain elements inside its own root, styled by that root's sheet; tiles are not custom elements. The same holds for bill lines inside `<k-bill>`, list rows inside `<k-list>`, KDS tickets inside `<k-lane>`, floor tables inside `<k-floor>`, cash-count rows inside `<k-cash-count>` and keypad keys inside `<k-keypad>`. Only standalone controls (a button, a field, a segmented control) are their own elements.
- **Controls inside a collection's items** (a switch in a settings row, the stepper and line actions in a bill line, the K button on a ticket, the share chips in a split row) are **not** nested kit elements and are **not** reimplemented. Each control's behaviour and CSS live once, in a module (`assets/kit/controls/stepper.js`, `switch.js`, `button.js`, `chip.js`), which exports `render(state)` (plain native elements with the kit's classes and ARIA), `bind(root)` (one delegated listener per root for press, keys, haptics and `kiwi:action`), and its CSS text. The standalone `<k-stepper>` element and the `<k-bill>` collection both call the same module, so there is one control per job and one implementation, with one root per collection.
- **Root counts, per hero frame** (counted with this rule; `<k-figure>` and `<k-icon>` render into the light DOM and have no root):

| Frame | Roots | Which |
| --- | --- | --- |
| Home (§18.1) | 8 | nav bar, date button, compare, range segmented, chart (its legend band and data sheet trigger are part of it), KPI grid (4 tiles), list group (with its See all row), tab capsule |
| Till, bill (§18.3) | 7 | rail, search field, Enter amount, category segmented, menu grid (all tiles), bill panel (lines, steppers, footer buttons, primary), sync indicator |
| Till, payment | 7 | the same, with the payment pane (methods, chips, keypad, primary) replacing the bill panel |
| Cash count (§18.9) | 5 | sheet, cash count (11 rows and the summary), keypad, Plain "Enter the total instead", primary. Revision 3's per-row steppers as nested elements would have added 33 roots; they are gone |
| KDS (§18.7) | 4 | station segmented, three lanes (the header text and clock are plain text) |

- **iOS 16.4 and later:** one constructed `CSSStyleSheet` per component type, shared through `adoptedStyleSheets`. A collection's sheet includes the CSS of the control modules it renders.
- **Below 16.4:** each root gets one `<style>` element holding its component's CSS. With these counts the worst hero frame (Home) holds 8 `<style>` copies, against the §19 budget of 60.
- **Gate:** the 200-tile menu render budget in §19, measured on iOS 15.8 at stage 2, and a root census on every capture frame.

### 20.7 Tokens and theme
- `tokens-2027.css` declares `--k-*` on `:root` **unconditionally**. The prefix collides with nothing, so the kit resolves on any page, flag or not.
- The dark set applies under `:root[data-theme="dark"]` **and** `body[data-vexel-mode="dark"]`. A `body[data-vexel-mode="light"]` re-declares the light set, so a kit element always matches what the page actually paints.
- The skin flag decides which surface implementation runs, never whether tokens exist.

### 20.8 `section{padding:96px 0}` (`tokens.css:208`)
- Stage 1 changes nothing. The kit never uses `<section>`, and its shadow roots are immune.
- Verified: **8 pages** load `assets/tokens.css` with a `<link>` and contain `<section>`: brand, business-plan-v2, dashboard, kiwi-caisse, kiwi-cuisine, pitch, tickets and wallet. (`booking.html` also loads it but has no `<section>`.) The legal and support pages (cookies, privacy, terms, status, support, mentions-legales) load `assets/landing/tokens.css` instead (`cookies.html:19`), and `kiwi-admin.html` and `kiwi-serveur.html` mention `tokens.css` only in comments.
- At stage 7 the rule is copied into the stylesheets of whichever of those 8 still rely on it, then deleted from `tokens.css`. Each page is checked by a before-and-after frame.

---

## 21. Migration, flags, stamps

### 21.1 Stages
Each surface has a flag: `localStorage.setItem('kiwiSkin2027:<surface>', '1')` (for example `kiwiSkin2027:till`), or `?skin=2027` for one load. Absent means off. Reads are wrapped in `try`, so a blocked storage means off.

A surface's flag becomes default-on only after:
- the critic round scores 10;
- `check.js` is green;
- an Amira Cafe end-to-end run (the restaurant venue only, orders labelled `TEST KIWI`, reversed through the product flow) passes;
- the old path then stays for 14 days.

The fix-now list ships in parallel under the current lock.

| Stage | Lands | Adopts it | Native build? | New gates |
| --- | --- | --- | --- | --- |
| 1 · Foundations | `tokens-2027.css`, fonts in `assets/fonts/` (Inter Tight and Plex Arabic, the faces the app ships today, §6.1), `format.js`, `business-day.js`, strings bundles, `haptics.js` (and the toast-hook removal), **the `app/plugins/kiwi-haptics` plugin in `stock` mode** (§15.2), **the Swift generator calls at `KiwiNativeShell.swift:145`, `:334` and `:936` removed and the 14 `navigator.vibrate` sites removed or routed** (§20.3), `motion.js`, `layout.js`, `ledger.js` (shadow mode), `segment.js`, `demo-seed.js`, icon sprite tool, `font-metrics.mjs`, `tools/fixtures/worked-example.json`; feel-layer routing (§20.3); **`native-runtime.css` and `native-shell.css`**: their `@font-face` rules (`native-runtime.css:1-4`, `native-shell.css:4-7`) repointed from `native-fonts/` to `assets/fonts/`, with the family names unchanged (`"Inter Tight"`, `"IBM Plex Sans Arabic"`, so the use sites at `native-runtime.css:7-8` change nothing; revision 7 named a `--kiwi-native-latin` token that §6.5 no longer defines, F6), in the same commit that adds `assets/fonts/` to `bundledFolders` and only then removes the matching `NATIVE_FONTS` entries (JetBrains Mono keeps its entry and its rule until stage 7, §6.5); **`assets/fonts/legacy-faces.css`** (`IBM Plex Sans Arabic` from `assets/fonts/`) linked, stamped, on **every page `tools/plex-census.mjs` puts in class (1), (2) or (4)**, 51 at `31c94529`: before the Google link or `article.css` on 36, so no later stage can drop a Google link with the legacy family undeclared (§6.1, revision 10, M2); after the Next chunk on 11, whose Arabic at 400 to 600 moves to the self-hosted build (200 and 300 stay on Google until the `@import` goes, §6.1; revision 14, P2); and on the 4 with no Plex (`kiwi-caisse.html`, `booking.html`, `tickets.html`, a tools fixture), whose Arabic moves from a system face to Plex (revision 12, M5); **`tools/plex-census.mjs`** committed with it; `assets/fonts/*.css` in the stamp tool's CSS-site pass (§21.3); `/api/config` returning the resolved cutoff and zone (§17.1); the stamp-tool and `check.js` extensions (§21.3); the iOS floor raised to 15.5 if the owner approves; the haptic latency baseline measured (§15.5); **`tools/app-bundle-manifest.json`** read by both build tools (§21.3); **the guest-page copy that promised a vibration rewritten** with the vibrate removal (§9.6) | Nothing visible with flags off **except two stated changes** (revision 12, M5): the Arabic text of the 4 pages that had no Plex is set in Plex, and the 11 Next-chunk pages set their Arabic at 400 to 600 in the self-hosted build instead of Google's (revision 14, P2) (AR capture diffs reviewed for those 15 pages, not assumed zero); and **provided the font move holds**: the faces are the ones the app ships today and only their files move, so the gate is a pixel diff of the native setup shell and of a runtime screen against the previous build, which must be zero, plus `bundle-manifest-test` (a font removed while a rule still names it would fall back to the system face, which is visible) | Yes (haptics routing and the plugin, native CSS, Swift generators, floor) | `token-contrast-test`, `kit-lint`, `type-steps-lint`, `motion-lint`, `no-random-demo`, `ledger-agreement-test`, `business-day-default-test`, `fixture-agreement-test`, `strings-completeness-test`, `strings-coverage-test`, `strings-sw-test`, `font-face-census-test`, `label-fit-test` (§6.6), the hit-area audit (§10.6, sampled through `elementsFromPoint`), the static haptic scan (§15.6), size gates, and (revision 6) `icon-vendored-test` and `icon-render-test` (§8), `font-coverage-test` (§6.3; revision 15, M3: every emitted character, with `local()` faces read from `tools/fonts/local-faces.json`, which `tools/font-cmap-dump.mjs` captures per platform), `strings-lint` and `strings-bidi-test` (§9.6, revision 15: codes, U+202F, French punctuation, bill and account, isolation; the counts from `tools/strings-corpus.mjs`), `bundle-manifest-test` (§21.3), `guest-copy-test` (§9.6), the fixture's mutation table (§18.0), and (revision 9) **`format-vectors-test`** (§6.3: `tools/format-vectors.json` through `format.js` in Chromium through the existing puppeteer-core harness, and in iOS WebKit through `xcrun simctl` as §6.3 says, plus the no-banned-character assertion on every output) |
| 2 · Kit | Every component in §10 and the control modules of §20.6, `kit.html`, `assets/kit/lens.js` with `liquid-lens.js` as its adapter | Gallery only | No | Gallery baseline, `kit-in-host-test` (both themes), `haptics-map-test`, `motion-park-test`, `kpi-polarity-test`, root census, the iOS 15.8 render budget |
| 3 · Self-contained | a) the PIN pad in every use §10.2 lists, including the team sign-in, clock-in, the till approval and the manager approval; b) KDS lanes in `kiwi-cuisine.html`, then replacing the till's embedded board; c) one guest-ordering app (redirect the old URLs after parity) | Access, team, KDS, ordering | Yes for (a) and (b) in the app | `work-surface-actions-test`, `i18n-leak-test` on these; **`pin-announce-test`** (revision 16, M3: every refusal of every use written once into the message row's stated region, again on a repeat, and a digit writing only the progress region; revision 17, M3: three automatic retries with the same answer write nothing, an automatic answer whose cause changed is written once, a Try again is written even when unchanged); **`offline-verifier-test`** (revision 16, M1: with the network cut, a code proven on this till in the last 7 days unlocks and approves a role-approved act; an unproven or expired one gets `pin.offline_unknown`; a refund, a stock adjustment and a sale cancellation get `pin.manager.offline` with the keys disabled; another store's rows never match, §10.26's R8; revision 17, M1: a waiter's code proven online, typed offline, gets `pin.not_till` on the till lock and `pin.till.not_till` on a till approval, and a cashier's code approves every till-level act that completes offline; revision 19, P8: every approval and unlock, online and from a row, at both levels, adds one authorization-log entry with the identity, `verdict` and `provenAt`); **`till-approval-level-test`** (revision 17, M1: every `requireTillOperator` call site, and `orderpro-inbox.js`'s rejection, opens the till approval with `pin.till.title`, and every `requireManager` site the manager approval; a 200 for a waiter's code is refused with `pin.till.not_till` or `pin.manager.not_manager`, never approved, except on the shift change, where any proven code but the incoming cashier's, a waiter's or a manager's alike, gets `pin.till.not_incoming` (revision 20, P5); revision 21, P7: the shift change's picker lists only the entries whose role `KiwiRoles.opensTill` accepts, so with a waiter, a cook and an entry with no role on the list it offers none of them; revision 19, P9: callers are counted at run time, at the authorization modal, and an opening or a row the other lacks fails it; revision 19, M1: with the network cut before the pad opens, exactly the paths §10.2 marks Needs a connection (the shift change, cancelling a live order, rejecting an online order, cancelling a table through `cancelSentTable` when it has a session or any ticket, removing an order from tracking; revision 20, M2: and cancelling a table through `cancelOpenTable` or `cancelNewOrder`, a phone-seated table included, completes offline and queues its session's closing in the outbox) open in the needs-connection state, accept no digit, keep focus and write their message once, and restoring the network enables the keys; every other till act, approved offline, completes; revision 19, M3: a network error after the final digit of such an act keeps the digits, offers Try again, and sends nothing by itself, through an `online` event too; revision 19, M2: on the shift change, a manager's code proven online is refused on the pad with `pin.till.not_incoming`, dots danger, keys enabled and Failed within 600 ms, the pad stays open, and the incoming cashier's code then completes the handover); **`pair-redeem-timeout-test`** (revision 19, M4; revision 20, M1: on the pairing pad and the store lock, a redeem whose answer is held past 8 s is never sent again and no other request follows it; the pad writes `pair.no_answer`, and a 422 to the same code typed again writes `pair.maybe_used`); **`pin-focus-test`** (revision 18, M6: focus stays on the key through loading, a pause and the needs-connection state, each announced once); **`clock-expiry-test`** (revision 18, M7: with the network cut after a clock-in code is typed, the pad stays silent while it retries, and at 5 minutes writes `clock.code_expired` once and enables the keys); **`dashboard-pin-migration-test`** (revision 20, M4 and P8: §10.2's dashboard rows, on the base of `tools/dashboard-pin-vault-test.mjs` and `dashboard-pin-vault-browser-test.mjs` at `a8158aad`: a profile holding `kiwiPins` loads the kit's lock; afterwards `kiwiPins` is gone, no row was made from it, and no four-digit value remains in `localStorage`; online the server is asked before any row is read; outside the demo surfaces a 401 `bad-pin` refuses, whatever this browser holds, and erases the matching row, and so does a staff-tier 200; a 401 `bad-pin` with `configured: false` opens the lock, unmatched, and writes no row, while one without the field refuses; revision 21: a list that is not empty with no code above the staff tier, and no proven row, shows `pin.dashboard.no_owner_code` with the keys enabled, and the first digit brings back the help text; a 429 refuses with the minutes left and the keys enabled; a 401 `unauthorized` shows `pin.signed_out` and keeps the row, which goes red against `a8158aad` until the engineering task lands; with the server unable to answer, an owner's row unlocks, a manager's only while the account's list has not loaded, no match refuses with the keys enabled, and after five misses the next code gets `pin.paused.self` for 5 minutes, with the keys enabled, while a server that answers still judges every code; revision 21, M5: a Face ID success sends the record's proof first and opens only on the server's yes, a "no" deletes the record, a record whose last yes is more than 7 days old does not open offline; with the server unable to answer, an owner's record opens, a manager's only while the account's list has not loaded, and a staff-tier record never (revision 22, F3); and a record with no proof is deleted, which goes red against `ae45b301` until the engineering task lands; revision 22, F1: after an idle relock, with no Face ID record nothing is asked and the pad shows, and with one the relock's success is the Face ID case above); **`biometric-unlock-test`** changes here (revision 22, F1, §10.2's idle relock): its two checks that a biometric success reveals the dashboard and runs the till's unlock hook are replaced by "with no Face ID record, nothing is asked and nothing opens; with one, a success sends the record's proof first" and "on the till, a pending relock asks no biometrics and shows the staff pad"; its other checks stay |
| 4 · Till core | Menu, bill, options, split, discount, payment (record-only card, paid on the local record, sync indicator **with the persistent unsynced count and `sync.send_now`**, **the tip row and popover, shared and per-person split tips**, the paid sound, **the regular and compact height forms**, §18.3), cash count (with cash tips), Z (with tips), shift tools (**`current-attendance-code` in `functions/api/team/live.js`**, §10.34), rail and More; **the Takeaway tab's online orders with the rail badge and the arrival alert, retiring the floating `#kop-chip` and its overlay `#kop-root` (§18.3; revision 25, M2), with `online-inbox-test`: an order to accept raises the badge, the sound and the toast once per poll and no haptic; accept fires Commit only on a server `ok` within 600 ms; reject and cancel open the till approval; a failure leaves the card unchanged**; **`tipCents` in the outbox body, a nullable `tip_cents` column migrated against the live D1, and its `/api/sale` validation** (§10.26); then business-type tills onto the shared frame, three per release, `autre` first | Till, verticals | Yes | `components-sum-test`, `discount-reasons-test`, target audit, the tip ledger cases in `components-sum-test` (key figure = base + tip; tips outside revenue; cash tips in expected cash; cash refunds a sub-line, never a term); **`sale-unsynced-test`** (revision 7: a `queue-storage-full` enqueue runs the paid moment, raises `sync.not_synced`, and `sync.send_now` replays by the same stable id with no second journal entry; a takeaway and a table case; revision 8: with `localStorage` full, `persistShift` returns false and the paid moment draws `sync.screen_only`, never `sync.saved_here`; revision 9: with Live Link off a sale raises no `sync.not_synced` and the rail shows nothing; with no merchant yet it counts in `sync.waiting_store` and the heartbeat sends it; with the service blob refused while the outbox's write-ahead copy fits, the outbox queues and the `sync.not_saved` banner and row stay until the next autosave lands; the merchant-mismatch return shows the store lock (revision 11); the receipt-return path reads the till's autosave state; revision 21: the store lock shipped in `762bb255` with `till-repair-lock-browser-test` (39 checks, in `check.js`), and §10.26's requirements R1 to R8 name their tests: that test, `tenant-gate-test` (the idle re-pair, the idle unpair, no other page loading the module, and a set-aside copy older than 12 hours), `lock-exit-test`, `pin-announce-test`, and the two `live-link` unit tests; a journal restored with `'sale-sync-unavailable'` entries drops that value; `merchant` survives a reload); **`banner-announce-test`** (§10.12, §16: each banner that appears on its own is written once into a live region that was already in the DOM, and `sync.saved_again` once on recovery; revision 11, M6: `sync.blocked` and `sync.not_synced` once each, politely, when they first apply, never on a count change, again after they clear and return, and nothing at all in the sync regions while the store lock shows, R7); **`pay-height-test`** (the keypad and primary are inside the viewport at 1032, 834, 820, 744 and 560 without scrolling, and at 500 the page, not a column, scrolls) |
| 5 · Dashboard | Home, Orders, Report, Customers and Retention, Compliance, Kiwi AI, then the drawers one at a time | Dashboard | Yes | Ledger test covering every figure; `chart-legend-test` (§10.22, wired into `check.js`) |
| 6 · The rest | Team app split view; the onboarding flow (retiring the Swift setup); sign-in and printer pages with tokens and dark mode; marketing (separate project) consumes the token file | Team, onboarding, access, marketing | Yes | Dark luminance check on every capture; **`reset-states-test`** (revision 8: each `/auth/reset` answer, including 500 with and without `retry` and 400 `bad-json`, lands on its §18.8 state) |
| 7 · Retire | Vexel and iOS 27 layers per surface; the feel layer and the `kiwi:native-haptic` adapter; **`assets/liquid-lens.js`**; `caisse-lang.js`; legacy tokens; JetBrains Mono; the stroke hack; the bare `section` rule (§20.8) | All | Yes | Lint: no legacy token names in adopted files |


**Stage 2, as landed (2026-10-14).** The kit is in `assets/kit/` (`core.js` and `controls/` for the host contract and the control modules, then `elements.js`, `nav.js`, `overlays.js`, `pin.js`, `dashboard.js`, `till.js`, `kds.js`, `actions.js`, `lens.js`) and `kit.html` is its gallery; no product surface adopts it. The gates above carry the repository's `-browser` suffix and are all in `check.js`: `kit-gallery-browser-test` (light and dark, EN and AR, 390 and 1280, plus per-section screenshot baselines in `tools/__screenshots__/kit-gallery/`), `kit-in-host-browser-test`, `haptics-map-browser-test`, `motion-park-browser-test`, `kpi-polarity-browser-test` (it also reads this section's polarity table and holds `KiwiLedger.polarity` to it), and `kit-budget-browser-test` (root census: Home 8 and Till 7, exactly §20.6's counts; the CSS inside the roots, 16.2 KB of 18). Added beside them: `kit-size-test` (§19's JS core and sprite rows), `kit-bidi-browser-test` (in Arabic, every figure the gallery paints reads left to right with its sign on the left, and no text node holds U+2066 to U+2069, U+200E, U+200F or U+061C), and kit-lint's stage-2 rules K9 to K13 (no `data-action`, action names `k.<component>.<verb>`, `customElements.define` only through `define()`, a `:not(:defined)` placeholder for every element, no fixed `height` on a text rule). The kit writes text through `KiwiStrings.html` and figures through `KiwiStrings.fig`, which put the number in `<bdi dir="ltr">` and the unit outside it (§6.3); a label that arrives already built by `t()` has its FSI and PDI turned into `<bdi>` before it paints. Open items, stated rather than assumed:
- **The iOS 15.8 render budget is not yet measured on the device.** `kit-budget-browser-test` renders the 200-tile menu in Chromium with the CPU throttled 4× as a proxy: about 3 ms of style and 8 ms in all once warm, and about 60 ms on the first render, compile included. The iPhone 6s run belongs to the capture harness and gates stage 4, the first stage that puts the menu in front of a cashier.
- **The JS core has 1.2 KB of headroom** (33.8 KB of 35, measured as shipped, comments included; about a third of that weight is comments). The next file added to that set needs either a comment-stripping step at deploy or a trim.
- **The cash count's reason chips are not drawn**: §18.9 requires them when the difference is outside tolerance, and §9.6 has no keys for the reasons yet. They are added with their strings, in stage 4 at the latest.
- **The chart's "now" dot in dark** uses `--k-accent-ink`, since the 2027 tokens define no mint.
- **`liquid-lens.js` adapts only where the kit is loaded.** The six shells load `assets/kit/motion.js` and `assets/kit/lens.js` before it, and there it hands every track to `KiwiLens.attach`. The twenty public guides (built by `tools/build-guides.mjs`) and several test fixtures load `liquid-lens.js` alone; on those it keeps running its original lens, so no page that does not load the kit changes. Stage 7 removes that path with the file.
- **`kit.html` is not a PWA shell.** `strings-sw-test` prints that it does not apply its precache rules to it (nothing of the gallery is precached, and every URL it loads carries its stamp). The gallery holds every component on one page, 68 roots, which §19's per-page 60 does not cover; it is not a product page.

**Stage 3a, as landed (2026-10-14).** The PIN pad is in every use §10.2 lists, each behind its surface's flag. With a flag off, that surface fetches no kit file and keeps its shipped pad; the first scenario of each suite below holds that. `assets/kit/pin-flow.js` (`KiwiPinFlow`) holds the response table, the 8 s timeout, the retry rule and the needs-connection gate for the eight uses. Three adapters lend it what only the host knows:
- `assets/kit/till-pin.js`, behind `kiwiSkin2027:till`: the till lock, both approval levels, the pairing pad and the store lock's pad (with Back, §10.26). Every `requireTillOperator` and `requireManager` caller names its act through `KiwiAuthAct` (fifteen sites in `kiwi-caisse.html`, plus `orderpro-inbox.js`, `pos-boutique.js`, `pos-maison.js` and `maison-stock-movements.js`). Every approval and unlock, at both levels, online or from a row, writes `verdict` and `provenAt` to the authorization log. The pairing pad keeps the shipped fail-soft: with no route (404, 405) or no answer, the same-browser map is read, and only a match there counts.
- `assets/kit/dash-pin.js`, behind `kiwiSkin2027:dashboard`: the dashboard lock. The lock controller in `dashboard.html` keeps the demo surfaces, the account's list, `KiwiDashPinVault` and the unlock choreography, and lends them through `kitApi`.
- `assets/kit/team-pin.js`, behind `kiwiSkin2027:team`: the team sign-in in two steps and the six-digit clock-in and clock-out pad, on live sessions only (the demo keeps its keypad).

The gates are in `check.js` section 14d: `pin-flow-test`, `pin-announce-browser-test`, `pin-focus-browser-test`, `clock-expiry-browser-test`, `pair-redeem-timeout-browser-test`, `till-pin-browser-test` (33 checks), `dash-pin-browser-test` (38) and `team-pin-browser-test` (21). The pad now repaints its dots when its length changes. Open items, stated rather than assumed:
- **`till-approval-level-test`'s run-time count is not built.** `till-pin-browser-test` drives the approval paths through `KiwiAuthAct` directly; `kiwi:approval-open` is dispatched at every opening, ready for the count that drives each act through the till's own buttons.
- **`dashboard-pin-migration-test` is split.** `dashboard-pin-vault-browser-test` holds the shipped rows with the flag off, `dash-pin-browser-test` the same rows on the kit's pad. The Face ID rows stay with `face-unlock-test` and the native app, which this stage does not change.
- **Decision 16 is still the owner's.** `biometric-unlock-test` is unchanged on both halves: the till still opens through `__kiwiUnlockApp`, and the dashboard still asks biometrics with no record (nothing then opens). Both changes ship in the native app, so they wait for a build.
- **`strings-sw-test` is per surface.** A surface the service worker precaches carries its bundle in all three languages, `strings.js` and the kit files.
- **The dashboard's demo surfaces keep the shipped demo rule.** A code the server refuses opens the demo, unmatched, so the preview codes still reach their previews; a configured account is judged as outside the demo.
- **Every flag is off by default.** None turns on before the four conditions at the top of this section.

**Stage 3b, as landed (2026-10-14).** The kitchen tablet (`kiwi-cuisine.html`) draws its board on the kit's lanes behind `kiwiSkin2027:kds`. With the flag off, the page fetches no kit file and keeps its shipped cards. `assets/kit/kds-board.js` (`KiwiKdsBoard`) puts one `<k-lane>` in each column body and hands every tap back to the page by name. The page keeps every decision: the queue, the stations, the optimistic gestures and their retry file, and the cancellation protocol. `<k-lane>` now carries what the shipped card showed:
- the chef's name and its translation;
- a composed menu's tag, the options, a line's own note, and a line another station cooks, drawn in ink-3;
- the server and the next course as capsules, and the "to follow" line;
- the cancellation alert with Stop cooking and Already plated;
- the unsynced line;
- on Ready, the time the order was ready, Station done, and Back to the kitchen.

Timers and tones move in place every second (`retime`), so a cook's finger never loses its button. Ready cards are compact, numbered in Title (§18.7). The newer card opens a sheet holding the rest, drawn full. Wide, the columns take §18.7's tracks: 384, the rest, and 272. Narrow, the shipped tabs still show one column. Twenty-two `kds.*` rows join §9.6. The gate is `kds-board-browser-test` in `check.js` section 14e. It runs against the real `functions/api/order/queue.js`, and every gesture is checked in the base. A sixth scenario drives the till's board on the demo till. Open items, stated rather than assumed:
- **The till's own board follows the till's flag.** Behind `kiwiSkin2027:till`, `kiwi-caisse.html` mounts the same adapter at the till's 16 px root, with no kitchen root (§6.2). New and Preparing are lanes, and the ready history is a third lane in its drawer. The screen scrolls as before (`fit="none"`; a free lane puts each ticket in its shortest column, and a column is 16 rem). A ready ticket offers recall until it is handed over, and no Mark served, since the till does not record the hand-over from this board. A line with a recipe opens it (`kds.recipe`). The zoomed ticket is not drawn: every lane already draws the full ticket. The Kitchen badge still counts every unready ticket, as shipped. §10.13's New-only count comes with stage 4's rail.
- **The header is still the shipped one.** The station segmented control, the live dot and the clock in Title (§18.7), Settings › Display (S, M and L roots) and the bump-bar and read-only modes (§13.6) are not built. The page uses the M root, 24 px. On a 1280 × 800 tablet, the New lane then shows one ticket with two lines before the newer card.
- **No screenshot baseline yet.** The suite asserts structure and the base, not pixels.

### 21.2 Ledger rollout
The `kiwiLedger` flag takes three values:
- `off`: legacy figures.
- `shadow`: renders legacy figures and computes ledger figures beside them. **Read-only, no writes.** It runs only on:
  - demo stores;
  - **Amira Cafe** (the owner-designated test venue, restaurant only, CLAUDE.md §6);
  - **anonymised fixtures** built by `tools/fixtures/ledger-fixtures.mjs`: seeded synthetic stores whose **shape** covers what the production mix has (a retail store with a large catalogue, several tenders and refunds; a restaurant with tables, voids and splits; the three cutoffs of §17.1). The generator reads no production data and contains no merchant names, codes or records.
  - **Never** on Santos Store or any other production merchant.
- Differences are written to the round's evidence file (`.kiwi/results/ledger-shadow/`), never to the console of a live session; on Amira Cafe they go to `window.__kiwiLedgerDiff` only when `?ledgerDebug=1` is set.
- `on`: ledger figures. Turned on per surface after the shadow differences are explained, with one changelog line for the business partner per surface.

### 21.3 Stamp and service-worker checklist (every stage, every new kit file)

**Tool changes, landed in stage 1 before any kit file:**
- **Scanner coverage.** `tools/stamps.js:72` and `:79` already match subfolders, because the class `[A-Za-z0-9._/-]` includes `/`, so `assets/kit/x.js?v=N` in a shell or in the SW is seen today. What they miss is file types: the extension group becomes `(?:js|css|woff2|svg)` in both regexes, so fonts and the per-surface sprite are stamped like scripts.
- **CSS sites.** A new pass in `scan()` reads `assets/kit/*.css`, **`assets/fonts/*.css`** (revision 11, M3: `legacy-faces.css`, §6.1), `app/src/native-runtime.css` **and `app/src/native-shell.css`** for `url("…?v=N")` and records those sites, so `@font-face` URLs move with `bump-stamp`. **Each `url()` is resolved against the folder its CSS file is served from, not the folder it is written in, before it becomes an asset key.** The served folder comes from one table:

  | CSS file | Served from | So `url("x.woff2")` resolves to |
  | --- | --- | --- |
  | `assets/kit/*.css` | `assets/kit/` (where it sits) | `assets/kit/x.woff2`; the kit writes `../fonts/x.woff2`, so `assets/fonts/x.woff2` |
  | `assets/fonts/*.css` (revision 11, M3) | `assets/fonts/` (where it sits) | `assets/fonts/x.woff2` |
  | `app/src/native-runtime.css`, `app/src/native-shell.css` | the www root | `x.woff2` at the root; they write `assets/fonts/x.woff2` |

  A CSS file the pass reads that is in none of these rows fails the scan, so a new folder of stylesheets cannot be skipped silently. **The list of those files moves into one shared data file both tools can read** (revision 6; revision 5 said the scanner would import `NATIVE_RUNTIME`, which cannot work: it is a non-exported `const` at `tools/build-app-www.mjs:48`, and `tools/stamps.js` is synchronous CommonJS, `:21-23`, which cannot `import` an ES module). Stage 1 adds `tools/app-bundle-manifest.json`, `{"nativeRuntime": ["native-runtime.js", "native-runtime.css", "native-privacy.js", "native-locale.js"], "shell": ["index.html", "native-shell.js", "native-shell.css"], "servedAtRoot": "app/src/", "bundledFolders": ["assets/fonts/"]}`. `shell` is today's `SHELL` literal (`tools/build-app-www.mjs:44`, copied to the www root at `:204-213`), which revision 6 left out; `build-app-www.mjs` replaces its `NATIVE_RUNTIME` and `SHELL` literals with `JSON.parse(readFileSync(new URL('./app-bundle-manifest.json', import.meta.url)))` and `stamps.js` with `require('./app-bundle-manifest.json')`. Neither keeps a copy of either list. `bundle-manifest-test` asserts two things on a built `www/`: every file the build copies to the www root from `app/src/` is in `nativeRuntime` or `shell`, so a fifth runtime file cannot be added to one tool alone; and every `url()` in every CSS file copied to the www root (both `native-runtime.css` and `native-shell.css`) resolves to a file present in `www/`, so a font cannot leave the bundle while a rule still names it. `package.json` gains no `"type"` (CLAUDE.md §2), which is why the shared file is JSON rather than a module. So `../fonts/inter-tight-latin.woff2` in `assets/kit/tokens-2027.css` and `assets/fonts/inter-tight-latin.woff2` in `app/src/native-runtime.css` and `app/src/native-shell.css` are all the key `assets/fonts/inter-tight-latin.woff2`, the same key as the shell's preload, and one file has one stamp wherever it is referenced. A `url()` that resolves outside the served tree fails the scan; `stamp-drift-test` fails if two references to one key carry different stamps. Because moving a font's stamp changes the CSS file's content, the same run bumps that CSS file's own stamp (`--all` already does this for content changes).
- **Runtime URLs are banned.** No kit code builds an asset URL at runtime. Strings bundles, fonts and sprites are referenced by literal stamped URLs in the shell (§9.3, §6.5, §8), which is the only place the scanner looks. `kit-lint` fails a template string that ends in `.js`, `.css`, `.woff2` or `.svg`.
- **`check.js` recursion.** `list()` (`tools/check.js:38-40`, used at `:43-44`) reads only the top level of `assets/`. It gains a recursive walk for `assets/kit/`, so kit files get the parse, forbidden-pattern and secret-string passes; vendored folders (`assets/icons/material/`) stay excluded.

**Every stage:**
1. Once per clone: `sh tools/install-hooks.sh`.
2. Reference each new file from its host with `?v=` (kit JS and CSS, every strings bundle for all three locales, fonts, sprite).
3. Add every boot-loaded file, all strings bundles and the fonts to `SHELL` in `kiwi-sw.js`.
4. `node tools/bump-stamp.js <files>` aligns the stamps and seals `tools/asset-stamps.json`.
5. When `SHELL` changed: `node tools/bump-stamp.js --sw`. It moves `CACHE` and the `register('/kiwi-sw.js?v=')` calls in `assets/dashboard-pwa.js`, `assets/caisse-pwa.js` and `assets/employee-live.js`, and their stamps.
6. A `pos-*` vertical adopting the kit: its REGISTRY `rev` in `assets/pos-dispatch.js` moves in the same run.
7. `node tools/check.js` green, including `pwa-shell-test`, `stamp-drift-test` and the `platform-ops-test` floor.
8. Local verification: unregister the SW, `caches.delete()` every key, then confirm the new stamps with `performance.getEntriesByType('resource')`.
9. Native:
   - keep `NATIVE_FONTS` in `tools/build-app-www.mjs` empty of any face that `assets/fonts/` ships (§6.5): after stage 1 it holds at most JetBrains Mono until stage 7 removes it **in the same commit as its `@font-face` rule**; a face leaves `NATIVE_FONTS` only in the commit that repoints every rule naming it, in both native CSS files;
   - rebuild `www/`;
   - cut a TestFlight build. The web is embedded, so a deploy alone does not reach the app.
10. Commit by path, never `git add -A`, then push `main` to both mirrors by URL.

---

## 22. What is deleted

- **Dashboard and guest chrome:**
  - the Home quick actions as a row: Day report, Invoicing and Export move to the places §12's table names; Customize is removed, because Home's four tiles are fixed (§18.1);
  - the phone hamburger;
  - the AI glow;
  - the Success rate tile and the Compare button (replaced by the compare control);
  - the Customers count cards and icon row;
  - the shipped Arabic for VIP, كبار for the segment and كبير for a customer's tag (`clients-directory.js@319ac100:56-58`), replaced by VIP in both, as the glossary's marker already reads (§9.1; revision 24, P5): one thing, one name;
  - the chart's legend row above the plot (the legend moves into a reserved band at the top of the plot area that no data enters, §10.22);
  - the greeting splashes (guest ordering, business-type tills);
  - the typewriter cursor;
  - `.rise` and `.grid-texture` on app surfaces.
- **Removed by revision 25 (each named in §12, with its code):**
  - the hero's chart or today toggle (`hero-toggle-chart`): Home always draws the chart (§18.1);
  - the hero's margin sentence in Kiwi AI (`fa-hero-insight`); its two figures stay, the margin in Report and the break-even as a follow-up question (§12, P12);
  - controls that only show a toast, so they promise an act they do not perform: "Configure the Glovo combo" (`hh-ai-glovo`), "Enable auto prompt" (`tip-prompt`), the Ultra band's three demo calls to action, and Settings' Export my data, which downloads nothing (§12, P11). If any of them gains a real act, it returns with a home;
  - the Santé Kiwi tile: Home has no "For you" row, and Kiwi AI answers what the tile says (§12, §18.6);
  - the till's narrow-screen rail toggle (`toggle-nav`): the phone has tabs, and the iPad's rail is always shown (§18.3).
- **Till and menu:**
  - per-tile steppers and category labels on tiles;
  - dish line art;
  - duplicate back controls;
  - triple totals;
  - always-open note fields;
  - the literal "Service (compris) 0 MAD";
  - native number spinners.
- **Kitchen:** the eye buttons; green halos on new tickets.
- **Offline code checks, only if owner decision 2 removes them (revision 16, M1):** the till's offline verifier (`rememberOfflinePin` and `verifyOfflinePin`, `caisse-pairing.js:75-99`), its stored rows under `kiwi:caisse:offline-pins:v1:<store>` (deleted from every till at the stage that ships the removal), offline unlock of the till lock, and offline approval of the acts approved by role. With the default (keep), nothing here is deleted.
- **Plaintext codes on the dashboard: deleted on `main`** (`4dcd0685`, `0268c92f` and `a8158aad`; revision 19). `localStorage.kiwiPins` is deleted at load without conversion and no longer written, and the lock asks the server first (§10.2's dashboard block). Nothing is left to delete here; `kiwiPins` stays in `TENANT_KEYS` for browsers that have not loaded the new lock.
- **The store lock's own design of revisions 11 to 20: replaced by what `main` ships in `762bb255`** (revision 21, §10.26). Removed: the pad on the lock screen and the Why sheet; the 409 `pair-other-store` refusal and its row in §10.2; the roster step and `rosterPending`; and nine keys, `lock.store.body_unpaired`, `lock.store.memory`, `lock.store.why`, `lock.store.why_body`, `lock.store.why_body_unpaired`, `lock.store.wrong_store`, `lock.roster.title`, `lock.roster.no_connection` and `lock.roster.server_error`. Kept from `762bb255`: its one button through `repairWithCode`, the set-aside copy and its 12 hours, the `/api/` net, the reload escape and its copy, mapped to the eight `lock.store.*` keys.
- **The same-browser pairing fallback on a hosted till** (revision 22, F5). Shipped `redeem()` answers a network throw, and a 404 or 405, from the same-browser `kiwiPairings` map through `localRedeem` (`caisse-pairing.js@762bb255:242-264`, the 404 and 405 at `:255`, the throw at `:264`), with no check of `hosted()` (`:44-45`), so a hosted till reaches it too. **Designed, a change to `redeem()`:** on a hosted till (`KiwiEnv.demosAllowed` false) `localRedeem` is never called, a throw answers `pair.no_answer` and a 404 or 405 answers `pin.unavailable` (§10.2); where demos are allowed, which `assets/kiwi-env.js` limits to a local host (`:43`), it stays as shipped.
- **The floor plan's redesign, up to revision 22: removed; the floor plan stays as shipped** (owner, 2026-10-13; §18.4, §23 decision 15). Gone with it: §18.4's design and §10.29's floor table; 24 `floor.*` keys (§9.6); the floor's contrast, target and primaries rows and its §6.6 rows; the lens plan track (§14.4) and `floor-tile-fit-test`; the floor's haptic changes (§15, §20.3); and in the preview, the after frames, check 6 and 14 mutation rows.
- **Data:**
  - `Math.random` demo journals and the seeded last-four generator (`dateRange.js:4366-4376`);
  - static seeds beside live figures (`dateRange.js:703-704`, `conformite.js:291-332`, `accounting.js:27`, `interactive.js:346, 1941`).
- **Paint and tokens:**
  - `background: var(--ink)` slabs;
  - `--emerald`, `--success #1FB574`, `#00FFAE`, `#14E08A`, `--urgent-bg`, `--riad` in UI, except in the floor plan's own rules, which stay as shipped (§18.4);
  - `data-vexel-mode` (stage 7).
- **Haptics:**
  - the `kiwi:toast` hook (stage 1), the PIN observers, the Success on every unlock and Face ID, the sheet-release buzz, and the navigation buzzes listed in §20.3;
  - the three direct UIKit generator calls in `KiwiNativeShell.swift` (`:145` on every host send, `:334` on a destructive native sheet, `:936` before a destructive `confirm()`);
  - every `navigator.vibrate` call: 10 removed, 4 routed through `KiwiHaptics` (§20.3).
- **Cash count:** the per-row steppers (§18.9).
- **Guest copy that promised a vibration:** `prep_note_post` and `prep_perm_denied` on `OrderPro.html` and `kiwi-order.html`, in all three languages and the FR HTML defaults (sites in §9.6), replaced by copy that promises only the chime and the notification, which stay.
- **Not deleted, stated because revision 5 lost it by omission: tips.** The shipped tip selector (card and cash, `kiwi-caisse.html:11108-11114`) and the split's shared tip (`:6628`) are kept and redesigned in §10.26 and §10.30; nothing about how a tip is computed or recorded changes.
- **Payment:** "Skip receipt" (§10.26); Done already leaves without a receipt, so the second control said the same thing.
- **Lens:** the native SwiftUI tab capsule's lens on kit-adopted pages (`KiwiNativeTabRoot`, `KiwiNativeShell.swift:803-825`), so one lens owner draws per screen (§20.3).
- **Misplaced or unsafe actions:**
  - account actions in work surfaces;
  - "Cancel table" next to the payment primary;
  - `window.confirm()`.
- **Duplicates:** the second kitchen screen, the second guest-ordering app, three of the four PIN keypads, the native Swift setup, the second lens implementation.

---

## 23. Owner decisions needed

| # | Decision | Recommendation |
| --- | --- | --- |
| 1 | **Minimum iOS (§4). Reopened.** | **Decided by the owner on 2026-10-13: as recommended.** **Raise to 15.5** (Option B). No device is lost; merchants on 15.0 to 15.4 update iOS once. Revision 2 recommended staying at 15.0, which the kit cannot honour without losing focus rings and sheet containment |
| 2 | **Offline unlock and offline approval: (a) the till, (b) the dashboard (§10.2; restated in revision 16, M1, which corrected the premise that codes are server-only; part (b) added in revision 17, M2).** **(a) The till.** The shipped till keeps, per store, a salted verifier of each code proven online on it, for 7 days and at most 12 rows, and compares a code typed offline against it. So today a locked till unlocks offline, and an act approved by role that writes locally or through an outbox (clear an order, cancel a table through `cancelOpenTable` or `cancelNewOrder`, or through `cancelSentTable` when it has no session and no ticket, cash in or out, close the till; and at the manager level a discount and the drawer without a sale) is approved offline, for any code proven on that till in the last 7 days whose role fits. A refund, a stock adjustment and a sale cancellation are not, and **neither is any act whose effect is a server write with no outbox** (the shift change, cancelling a live order, rejecting an online order, cancelling a table through `cancelSentTable` when it has a session or a ticket, removing an order from tracking; revision 19, M1; revision 20, M2): the pad says so before a code is typed (§10.2). When the till has no row at all, it opens with no code **whenever the store's staff list cannot be loaded** (revision 17, P6): no network, but also a server error, a captive portal's HTML page answered with 200, or JSON without a staff list (`caisse-pairing.js:621-632`, `:652-660`). The trade-off: a till keeps working through an outage, against **a revocation lag of up to 7 days** (revision 18, M4): a code removed, or a role lowered, in the dashboard still unlocks and still approves at its old role offline on a till that proved it, until its row expires. An offline verdict is "proven online within 7 days, may be stale"; §10.2 requires every one to be logged with its identity and proof time, so the owner can find them afterwards. **(b) The dashboard, as shipped in `4dcd0685`, `0268c92f` and `a8158aad`.** The server is asked first, and outside the demo surfaces its refusal is final; when it cannot answer, salted rows of codes it proved on this browser (owner and manager tiers, 12 per account, 7 days, paused for 5 minutes after five misses) unlock, a manager's only while the account's list has not loaded (§10.2). **Keep or remove, (a) and (b)?** | **Decided by the owner on 2026-10-13: as recommended.** **(a) Keep, as shipped** (the spec's default), because an offline-first till that cannot be unlocked or approve a discount during an outage stops the counter, and 7 days and 12 rows already bound the exposure. Two changes either way: the open-with-no-code branch also applies after the store lock's pair-back (revision 21, §10.26: whoever pairs back typed a code created from the store's dashboard), and CLAUDE.md §6 and the comments at `caisse-pairing.js:888-889` and `:939-940` are corrected to describe the verifier. An already signed-in cashier is not auto-locked while offline, as before. **If removed:** §10.2's three offline till-lock rows and the two offline approval rows are replaced by `pin.offline` with keys disabled, `pin.offline_unknown` is deleted, and §22 lists `rememberOfflinePin`, `verifyOfflinePin` and their stored rows as deleted. **(b) Keep, as shipped** (the default): the server is always asked first, so a changed code stops working at once, and an owner on a laptop during an outage still reaches the books. Two points of the shipped design are decision 14's. **If removed:** the dashboard lock with no answer refuses every code with `pin.dashboard.offline_unknown` or `pin.unavailable`, and `KiwiDashPinVault` is deleted |
| 3 | Add `remaining` to the `/api/pin/verify` 401 response | **Decided by the owner on 2026-10-13: as recommended.** Yes, so the pad can say "2 tries left" when ≤ 3 remain |
| 4 | Plugin v2: distinct accessibility text sizes plus the accessibility settings bridge (§16). **Revision 24:** the sizes shipped in `f99fa1e1` for the iPhone dashboard (1.65, 1.94 and 2.0, with the large-type reflow, §6.4); what remains is the bridge, and the kit's own geometry above 1.35 | **Decided by the owner on 2026-10-13: as recommended.** Yes, as one native release after stage 2; the geometry for sizes above 1.35 becomes its own round |
| 5 | Latin face | **Settled in revision 7: keep Inter Tight** (§6.1). Revision 6's switch to Inter rested on a file that is in neither the repository nor `app/node_modules`, and revision 7 downloads nothing, so the preview could not render the shipped face. Inter Tight is the 44,872 B file the app already bundles (`@fontsource-variable/inter-tight`); every width in §6.4, §6.6 and §18 is measured in it, the preview draws in it and checks at load that it did, and `label-fit-test` logs the face and reference width it measured. A later switch to Inter would be its own decision, with its file vendored first and every width re-measured |
| 6 | Stock behaviour on Void (unprepared returns to stock, prepared becomes waste) | **Decided by the owner on 2026-10-13: as recommended.** Confirm with the stock module before stage 4 |
| 7 | Cash difference tolerance default | **Decided by the owner on 2026-10-13: as recommended.** ±20.00 MAD, editable per venue |
| 8 | **Recovering from the store-wide code pause.** Eight wrong codes on any till, including a manager's inside a cancel sheet, pause every code on every till of the store for 15 minutes, and a success does not clear it (`_lib.js:1272`, `:1294-1302`) | **Decided by the owner on 2026-10-13: as recommended.** Add `POST /api/pin/unlock`: owner session plus the owner's personal code (through `verifyAccountPin`, itself rate-limited), deleting the `pin:<merchant>` row for `till:<merchant>`, and report it in `/api/config` as `features.pinUnlock: true`. **Fallback until then (designed, not hypothetical):** the till pad says only how long to wait (`pin.paused.store`), there is no owner hint and no Settings row, and nothing in the product mentions an unlock. Also consider keying the bucket per paired device instead of per store, which would confine a pause to one till; that is a security trade-off for the owner and the server's author, not a design call |
| 9 | Prepared haptic generators and the Soft style (§15.1, §15.5) | **Decided by the owner on 2026-10-13: as recommended.** Switch `app/plugins/kiwi-haptics` (landed at stage 1 for measurement, §15) from `stock` to `prepared` mode: long-lived generators with `prepare()`, and the `.soft` impact style. **Fallback until then:** the plugin stays in `stock` mode, which feels exactly like today's `@capacitor/haptics`; Grab uses impact Light, and the latency gate is "no regression against the stage 1 baseline" instead of ≤ 20 ms. The baseline is measurable either way, because the plugin's `play` returns the native timestamp in both modes |
| 10 | Owner session on a till device set up by the owner (§18.8) | **Decided by the owner on 2026-10-13: as recommended.** Keep it, behind the dashboard lock, because the owner is the operator. Kitchen and team devices always sign the owner out |
| 11 | **Server-side discount approval** (§10.2, §10.31). Today the till checks the approving code's **role** in the browser (`caisse-pairing.js:950-953`) and `/api/sale` records the `actorId` without checking it (`sale.js:178-190`) | **Decided by the owner on 2026-10-13: as recommended.** Add `action:{kind:'discount', amountCents, grossAmountCents, reason}` to `POST /api/pin/verify`, issuing an `approval` proof like the refund one (`pin/verify.js:41-50`), and have `/api/sale` require it for **every** discount, as the till already asks for one (`kiwi-caisse.html:18166`). No limit is introduced; a per-merchant threshold would be a separate product decision, not part of this one. **Fallback until then:** the design is unchanged (same pad, same states, same copy), and the browser role check stays as shipped |
| 12 | **Reset token consumed before the password update** (revision 7, M2). **Shipped** (revision 8): `e5639388` hands the token back when the password write fails, and `a3de3011` answers `{error:'update-failed', retry:true}` only when that hand-back changed exactly one row (`reset.js@a3de3011:132-145`); `reset.html@a3de3011:327` keeps the form on `retry` | No decision left. §18.8 routes `retry: true` to R6 · update failed, same link, and a plain `update-failed` to R5 · update failed, link lost, which is now the rare case where the hand-back itself failed |
| 13 | **A till whose open service belongs to a store that will never pair it back** (revision 11; revision 13: the parked service is removed; revision 21: rewritten for `762bb255`). As shipped, a reload leaves the lock, and the service stays set aside on the device; pairing back within 12 hours of its last save restores it, and after that it is not restored (§10.26) | **Owner, 2026-10-13: as recommended.** Not designed here; it stays with the tenant-safety engineering task. What should happen to a set-aside service that is never restored, and to its sales not yet sent: this direction does not design it. A release that books them to the old store from another store's till would need a server route; if the owner wants it, it is part of the tenant-safety engineering task, with its own review |
| 14 | **The dashboard's offline rows, two points of the shipped design** (revision 19; §10.2's dashboard block). (a) A row is a salted SHA-256 of a four-digit code, so whoever can read this browser's storage recovers the code in at most 10,000 hashes: it hides the code from a glance, not from a person with the device. (b) A manager's row unlocks offline while the account's list has not loaded, which revision 17 had designed out | **Decided by the owner on 2026-10-13: (a) accepted, (b) accepted.** Should the owner ever want more for (a), the fix is a slow derivation (PBKDF2 in WebCrypto) |
| 15 | **The floor plan** (revision 23; §18.4). Revisions 21 and 22 redesigned it, and the owner rejected both | **Decided by the owner on 2026-10-13: the floor plan stays as shipped.** This direction does not redesign it |
| 16 | **The till's biometric relock** (revision 25; §10.2). `73870f82` made the dashboard's relock ask the server, and left the till's as it was, pending the owner: after a relock, a face or finger enrolled on the iPad opens the till with no staff code, so the acts that follow carry no cashier | **Decided by the owner on 2026-10-13: as recommended.** **Return the till to the staff pad and ask no biometrics on the till**, as §10.2 designs: biometrics prove whose iPad it is, not who is at the counter. Until decided, the shipped behaviour stays, and §10.2 names it as a known deviation |

**Revision 25, owner on 2026-10-13:** every open decision above takes its recommendation. Decisions 5, 12, 14 and 15 were already settled.

**Left open at revision 25, the last critic round (owner, 2026-10-13).** These are known, small, and not closed by this revision. Each is a choice or an engineering task, not a gap in the direction:
- **"Can I hire a waiter?"** is the shipped hire simulator's question, and §9.6 keeps it for every trade whose costs are set up (`ai.suggest.hire`), so a shop or a spa reads "waiter". A per-trade word ("a salesperson", "a therapist") needs four more strings.
- **Face ID, the dashboard (§10.2).** `73870f82` closed the main gap. Four details still differ from the design: a manager's record opens offline within 7 days whatever the account's list holds; a 429 opens offline; the relock asks for biometrics even with no record; and it opens through `reveal()`, not with the record's tier. Engineering's, and the design stands.
- **The quick messages' French** (`till.team.quick_text`) keeps the shipped Darija in Latin letters ("Khalik blati svp · client attend.", "Pause finie, 3awd l'service."), because that is what the staff send today. A French or a Darija-only set is the owner's choice.
- **Three till acts carried over without a 2027 key** (§12, the inventory): Reprint the bill, Customer and loyalty on the bill, and removing a discount. They keep their shipped controls, restyled, at stage 4.
- **A custom date range** keeps the shipped picker in Report (§12); its sheet is not drawn.
- **Compliance's shipped tabs** (Z history, hygiene, equipment, documents) become rows of its obligations list (§12); the rows are not drawn.
- **Export my data and the toast-only controls** (§22) return only with a real act behind them.
- **Kiwi Pay's Expenses and cards** (`assets/depenses.js`) are outside this direction (§12).

---

## 24. Findings index (round 25 critique to section)

Motion and Performance scored 10 in round 25 and are not reopened. All four rebuttals were accepted again. **The body of this spec is authoritative**, and the earlier indexes below are history. Revision 25 is the last critic round (owner, 2026-10-13); what it leaves open is listed under §23.

**Round 25 critique (revision 25). Majors:**

| Finding | Fix | Section |
| --- | --- | --- |
| M1 · Kiwi AI's rows 1 to 3 are a restaurant's for every trade; the shipped per-trade chips have no home | Rows 1 to 3 come from the store's trade, the shipped `aiChips` (`getVocab`) in FR, EN and AR, keyed `ai.suggest.restaurant`, `.boutique`, `.spa` and `.hotel`; the follow-up chips keyed and homed; a second Kiwi AI frame for a new shop; check 20 and rows 209 to 214 | §9.6, §12, §18.6, §18.0, preview |
| M2 · The online-order inbox has no home | The Takeaway tab's top section, three groups, with the rail badge; the card and its acts with entry keys; the arrival alert (sound, no haptic, a reduced-motion form); stage 4 retires `#kop-chip` and `#kop-root`; the floor stays as shipped | §9.6, §12, §15, §18.3, §21, preview |
| M3 · The four quick messages are dropped | One-tap chips above the message field, `till.team.quick` and `.quick_text`, measured in three languages | §6.6, §9.6, §18.3 |

**Polish** ("drafted" marks a pair drafted by a small model, then reviewed):

| # | Fix |
| --- | --- |
| 1 | A named `server-ack` trigger: Commit on the frame a confirming answer is applied, within 600 ms; the haptics-map test splits Paid (local record only) from Commit (§15.1, §15.2, §15.3, §15.6) |
| 2 | "Set a goal" is its own 44-tall row, and the coordinates below it re-derived, on the 6.9 and the SE (§18.1, §18.11) |
| 3 | The compare control's coordinates re-derived (drafted; §18.1) |
| 4 | Fullscreen: the native app already hides it (`native-runtime.css@31c94529:62`); no design change rests on the old claim (drafted; §18.3) |
| 5 | The Till ID in the Latin face with `tnum`, as §1 sets codes (drafted; §18.3) |
| 6 | Check 18 reads the painted mark in both themes: visibility, the track's box, the fill's box and start side, its colour against the track, its place; rows 201 to 208 are the critic's eight escapes (§18.0, preview) |
| 7 | The preview's captions match the frames (drafted; preview) |
| 8 | `home.goal` re-measured with `tnum`; §6.6 measures with the frame's font features (§6.6) |
| 9 | Stock stays open to every role, with its alert count, under Shift; §10.2's stock-approval row corrected (drafted; §10.2, §12, §18.3) |
| 10 | `act.close_till` and `act.cancel_sale` name `till.more.close` and `till.more.cancel_sale` (drafted; §9.6, §12) |
| 11 | Settings' inventory: Delivery channels in Business, the Morning briefing in Notifications, Export my data not shown because it downloads nothing (drafted; §9.6, §12, §22) |
| 12 | The hero's margin sentence removed, its two figures kept; the follow-up chips homed (drafted; §12, §18.6, §22) |
| 13 | The Kiwi AI capsule keeps its label, measured at factors 1 to 1.35, with the SE clearance; check 19 holds labels, rows 215 to 217 (drafted; §6.6, §18.1, §18.11, preview) |

**Also in revision 25:** the Face ID row refreshed for `73870f82` (§10.2), with the till's relock as decision 16 (§23); and the inventory pass, which names every shipped entry point (§12).

**Round 24 index (revision 24), kept as history.** Motion, Accessibility and Performance scored 10 in round 24.

**Round 24 critique (revision 24). Majors:**

| Finding | Fix | Section |
| --- | --- | --- |
| M1 · Till More has no entry for Open the drawer, Team and its breaks, Fullscreen and sign out; §12's preface says nothing else is removed | More › Shift gains Open the drawer, Team on shift (breaks and messages) and Sales this shift; This device gains Fullscreen (browser only), Reload, Till ID and Sign out; §12 maps every shipped rail control; the preface says exactly what is removed; a table of where each `act.*` starts, held by `strings-lint`'s act-reachability rule | §9.6, §12, §18.3 |
| M2 · Home loses the daily goal and the computed recommendations | The goal line under the key figure with its mark, drawn in every Home frame, the goal in Settings › Business and onboarding's restored goals step; the shipped recommendation as Kiwi AI's first card, with the composer's mic as its input's; check 18 and rows 197 to 200 | §6.3, §6.6, §12, §18.0, §18.1, §18.6, §18.8, §18.11 |

**Polish:**

| # | Fix |
| --- | --- |
| 1 | The mic in ink-1, the one Icon button style (§18.6, preview) |
| 2 | The Action Center labelled "Actions" (`ai.actions.button`), measured in three languages at factors 1 to 1.35 (§6.6, §9.6, §18.6, preview) |
| 3 | A §15.3 row: Commit on the response frame of an `ok` settle within 600 ms of the tap, a renewal included, and on a `replayed` renewal; nothing on a failure or a late answer (§15.3) |
| 4 | `KiwiFormat.share`, unsigned and whole, with vectors; `ai.suggest.price_rise` draws 5% (§6.3, §9.6, preview) |
| 5 | VIP in Arabic for the segment and the marker, recorded in the glossary and §22 (§6.6, §9.1, §9.6, §22) |
| 6 | Both renewal branches as shipped (§18.6) |
| 7 | "The other four"; check 19 compares every frame's icons, so a removed control turns red; rows 193 to 196; the not-compared list names a control without an icon (§18.0, preview) |
| 8 | Row 6, the operational start card's question, keyed as `ai.suggest.ops.*` (§9.6, §12, §18.6) |
| 9 | Reconciliation and Anti-fraude: removed on `main` in `cda95c04` (phase 1: no acquirer data), not homed (§12, §18.2) |

**Round 23 index (revision 23), kept as history.** Motion, Feel, Accessibility and Performance scored 10 in round 23.

**Revision 23, the owner's decision (first):**

| Item | Fix | Section |
| --- | --- | --- |
| "Nope, revert to the old plan de salle" (owner, 2026-10-13) | The floor plan stays as shipped; revisions 21 and 22's floor is removed; what other screens read is kept (`floor.table`, the fixture's table-to-zone `plan`, the status rule) | §5.3, §6.6, §9.2, §9.5, §9.6, §10.29, §13.2, §14.4, §15, §18.0, §18.4, §20.3, §21.1, §22, §23 (15), preview |

**Round 23 critique (revision 23). Majors:**

| Finding | Fix | Section |
| --- | --- | --- |
| M1 · Kiwi AI loses its dictation, its Action Center and its calculator | The mic in the composer with its recording, signed-out and fallback states; the Action Center in the header with its pending count, and its sheet; the calculator and the attach button in a tools row; the two simulators as suggestions; a table of every shipped function and its home | §6.6, §9.6, §12, §18.0 (fixture, check 16, rows 189 to 191), §18.6, preview |
| M2 · Invoicing and Export have no place in the IA | Money: Invoicing and Accounting; `invoice.a4` in an order's detail and the till's receipt choice; Report's Export menu; Customers' overflow; Day report is the Report tab | §9.6, §10.26, §12, §18.1, §18.2, §18.5, §22 |

**Polish:**

| # | Fix |
| --- | --- |
| 1 | `orders.other` with `sync_alt`; the shipped `wallet` method named once; `pay.other` "transfer or wallet"; the fifth segment drawn and measured (§6.6, §9.6, §18.2, check 13, preview) |
| 2 | `customers.segment.vip` and e-mail search, drawn; check 9 and row 192 (§6.6, §9.6, §18.0, §18.5, preview) |
| 3 | "Leave this service", and `lock.store.reload` to match, true paired or unpaired (§9.6, §10.2, §10.26) |
| 4 | Text paint named as not compared, except the deltas' colour and fill that check 1 reads (§18.0, preview) |
| 5 | Pass only when all 38 icon files are read and match; the self-test box says "not complete" on a partial read (§18.0, preview) |
| 6 | The shipped wordmark on Home's nav bar and the till's rail head (§1, §18.1, §18.3, §18.11, preview) |
| 7 | The dashboard's 401 and 403 rule as `main` ships it since `d004116f`, with rows for `account-revoked` and a non-JSON 401; the design keeps disabled keys on a signed-out answer (§10.2) |

**Round 22 index (revision 22), kept as history.** Visual, UI, Motion, Feel, Accessibility and Performance scored 10 in round 22.

**Revision 22, the owner's item, withdrawn in revision 23 and kept as history:**

| Item | Fix | Section |
| --- | --- | --- |
| The floor ("new plan de salle is terrible") | Withdrawn (revision 23). It was: drawn from the merchant's plan at one scale; rooms as one surface, fixtures as hairlines; state drives emphasis; one-word tags, no legend; seat ticks; true shapes; per-table forms with the chord rule; the RTL rule; Press, Popover and lens; the pane table recomputed | §6.6, §9.5, §9.6, §10.29, §14.4, §18.0 (plan, checks 6, 13 and 17, rows 34 and 184 to 188), §18.4, preview |

**Majors:**

| Finding | Fix | Section |
| --- | --- | --- |
| 1 · a second biometric path opens both locks with no code | Named as a known shipped deviation; designed: the dashboard asks biometrics only with a Face ID record and sends its proof first; the till returns to the staff pad and asks no biometrics; the test's two checks change at stage 3a | §10.2, §21.1 |
| 2 · the store lock has no exit on the iPad app, and its pad no way back | `lock.store.open_without` runs the reload; Plain Back and Escape on the pad; `lock.store.reload` names the action; difference 6, R9, `lock-exit-test` | §9.6, §10.2, §10.26, §14.4 |
| 3 · the designed Face ID has no tier rule offline | Owner opens, manager only while the list has not loaded, staff-tier never, in the Face ID and Read rows | §10.2 |

**Polish:**

| # | Fix |
| --- | --- |
| 4 | Which segment or tab is drawn as selected is listed as not compared, in §18.0 and the preview |
| 5 | §22 lists the same-browser fallback's removal on hosted tills; §10.2's 404 or 405 row; §10.26 difference 1 names the change |
| 6 | A Plain support link under `pin.dashboard.no_owner_code` (§10.2) |

**Round 21 index (revision 21), kept as history.** Visual, Motion, Feel, Accessibility and Performance scored 10 in round 21.

**Majors:**

| Finding | Fix | Section |
| --- | --- | --- |
| 1 · check 13 false-passes three hiding techniques | A closed list of what it reads, "and nothing else", with "Not read, by construction" for everything outside it; stacking under a negative `z-index`; pseudo-element containing blocks from every property that creates one, and coverage summed per icon; the critic's A, B and C as rows 180 to 183 (AG), red | §18.0 (check 13, rows 180 to 183), preview |
| 2 · §10.26 does not match the lock `762bb255` shipped | Rewritten from `762bb255`: what it does, its copy mapped to eight `lock.store.*` keys, five differences with a reason each, the removed design listed, R1 to R8 | §9.6, §10.2, §10.26, §14.4, §15.3, §18.0 (check 15, its rows), §21.1, §22, §23 (13) |
| 3 · no row for an account with no owner code | The "No owner code" row, triggered as shipped, keys enabled; `pin.dashboard.no_owner_code`, with "Contact Kiwi" marked as a change | §9.6, §10.2, §21.1 |
| 4 · the offline pause disables the keys while the server could answer | Keys enabled; every code goes to the server first; the pause is read only when the server cannot answer; the dashboard's 429 keeps the keys enabled too, as shipped | §10.2, §21.1 |
| 5 · Face ID checks nothing on the server | Named as a known shipped deviation; designed: a server proof, the server's yes first, a "no" deletes the record, 7 days offline; "asked first" now says "for every code typed" | §10.2, §21.1 |
| 6 · `act.discount` cannot state a fixed amount | `act.discount.pct` and `act.discount.amount`, picked by the remise's `kind`; a text vector for each | §9.6, §10.2, `strings-bidi-test` |

**Polish:**

| # | Fix |
| --- | --- |
| 7 | The handover picker lists only entries `KiwiRoles.opensTill` accepts, as that function reads them; the shipped picker's difference stated (§10.2, §21.1) |
| 8 | "No codes yet" appears only after a first code is typed, and opens the lock unmatched, as shipped; the till analogy removed (§10.2) |

**Round 20 index (revision 20), kept as history.** Visual, Motion, Feel, Accessibility and Performance scored 10 in round 20.

**Majors:**

| Finding | Fix | Section |
| --- | --- | --- |
| 1 · the store lock's probe is forbidden by R1 | Dropped: after a redeem with no answer, nothing more is sent and `pair.no_answer` is written | §10.2, §10.26 (R5), §15.3, §21.1, Rebuttals 4 |
| 2 · the set blocks a cancellation that ships working offline | Classified by code path: `cancelSentTable` with a session or a ticket needs a connection; `cancelOpenTable` and `cancelNewOrder` complete offline through the outbox | §10.2, §21.1, §23 |
| 3 · the icon check's "what this proves" was false | The hit test accepts only the icon, its `svg`, its `<use>` or an ancestor; pseudo-element boxes include margins; rows 178 and 179; the rest named as not read | §18.0, preview |
| 4 · the dashboard opens on a refusal in an unnamed state | Written from `a8158aad`: a refusal is final outside the demo surfaces; "No codes yet" from the server's `configured: false`; the offline pause; the test matches | §10.2, §15.3, §21.1, §22, §23 |

**Polish:**

| # | Fix |
| --- | --- |
| 5 | On the shift change, `pin.till.not_incoming` takes precedence over `pin.till.not_till`, in the rows and the test (§10.2, §21.1) |
| 6 | The manager-level "says so before the code is typed" clause deleted (§10.2) |
| 7 | After a 503, the retry on a pad is the code typed again; Try again only in the roster step (§10.2) |
| 8 | Only a `bad-pin` and a staff-tier 200 erase a dashboard row; `unauthorized` keeps it; the shipped difference stated; tested (§10.2, §21.1) |
| Owner | Decision 14 recorded: decided on 2026-10-13, (a) and (b) accepted (§23) |

**Round 19 index (revision 19), kept as history.** Visual, Motion, Accessibility and Performance scored 10 in round 19.

**Majors:**

| Finding | Fix | Section |
| --- | --- | --- |
| 1 · approve-then-refuse offline for four more acts | "Needs a connection" means a server write with no outbox: the shift change, cancelling a live order, rejecting an online order, cancelling a table with a session or any ticket, removing an order from tracking; each opens in the needs-connection state; the "cancelled locally" claim replaced by its exact condition; `till-approval-level-test` asserts the set | §10.2, §21.1, §23 |
| 2 · the handover approves the wrong person, then refuses | `pin.till.handover_sub`; `pin.till.not_incoming` on the pad, dots danger, keys enabled, Failed within 600 ms; "who may approve" is the incoming cashier only; tested | §9.6, §10.2, §15.3, §21.1 |
| 3 · two retry rules for one state | An approval never retries by itself: Try again only, digits kept, in the row, the retry rule and the copy's note | §10.2, §9.6 |
| 4 · a single-use code retried blindly | Never resent; the store lock checks `/api/pair/state`; `pair.no_answer` and `pair.maybe_used`; idempotency by `terminalId` as an engineering option; `pair-redeem-timeout-test` (Rebuttals, 4, in part) | §9.6, §10.2, §10.26, §15.3, §21.1 |
| 5 · the icon check's claims | Position, size, viewBox, glyph box, stroke, shadow, background image, painted pseudo-elements, legacy clip, inward outline, text fill now read; rows 167 to 177, each red; the claim narrowed to what is proven, with what is not read listed | §18.0, preview |

**Polish:**

| # | Fix |
| --- | --- |
| 6 | The till approval's success defers to each act's own row; a closing's Paid follows the close row (§15.3) |
| 7 | `clock.code.sub`: "The code changes every few minutes", EN, FR and AR (§9.6) |
| 8 | Till-level authorization-log entries with identity, `verdict` and `provenAt` stated as a requirement; `offline-verifier-test` asserts them (§10.2, §21.1) |
| 9 | Callers counted at run time, at the authorization modal, which sees the alias and ignores comments (§10.2, §21.1) |
| Lead's note | §10.2's dashboard block, §22, §23 decisions 2 (b) and 14, and `dashboard-pin-migration-test` follow `4dcd0685` and `0268c92f` |

**Round 18 index (revision 18), kept as history.** Visual, Motion and Performance scored 10 in round 18.

**Majors:**

| Finding | Fix | Section |
| --- | --- | --- |
| 1 · the icon check covered less than it claimed | Paint effects, the sprite path's own style, clipping, contrast and covering added; exactly what is read, and not read, stated; the two allowed coverings named; mutations 156 to 166; a sweep of 1,918 cases, 8 left out by the stated rule | §18.0, preview |
| 2 and 3 · offline approve-then-refuse for the handover | Three acts that need the server's proof (the shift change, cancelling a table with a server visit, removing an order from tracking); their pad never consults the verifier; the needs-connection state, before entry, with its exits and copy; no success feedback; §23 decision 2 corrected; `till-approval-level-test` | §10.2, §9.6, §15.3, §23, §21.1 |
| 4 · an offline verdict can be stale | The Staleness row; `verdict: 'offline'` and `provenAt` recorded and traced; the revocation lag, a lowered role included, named in §23 decision 2 | §10.2, §15.3, §23 |
| 5 · the `{act}` slot | 14 `act.*` keys, verbal nouns in AR; FR "Autorisation" at both levels; the glossary's closure split into act and button; the "Act phrases" lint | §9.1, §9.6, §10.2 |
| 6 · disabled keys drop focus | `aria-disabled`, activation ignored, focus kept, announced once through the existing regions; `pin-focus-test` | §10.2, §21.1 |
| 7 · clock-in can outlive its code | At 5 minutes after entry, automatic retry stops and `clock.code_expired` is written once; `clock-expiry-test`. No time is kept (Rebuttals, 3) | §10.2, §9.6, §21.1 |

**Polish:**

| # | Fix |
| --- | --- |
| 8 | Paid on the frame the closing is committed; the wait before it is the quiet busy state (§15.3, §18.9) |
| 9 | Every approval caller with file and line, and a test that fails on a missing one (§10.2) |
| 10 | `pinVenue` marked shipped in `59392a9c`; the dashboard plaintext task still in progress (§10.26, §10.2) |

**Round 17 index (revision 17), kept as history.** Visual, Motion and Performance scored 10 in round 17.

**Majors:**

| Finding | Fix | Section |
| --- | --- | --- |
| M1 · the till's approval level and its role refusal were missing | An eighth use, the till approval, with `pin.till.title` and `pin.till.sub` naming the three roles; every `requireTillOperator` site and `orderpro-inbox.js`'s rejection listed, and the manager acts with theirs; a "200, but the role does not open the till" row with `pin.not_till`, `pin.not_till.unnamed` and `pin.till.not_till`; the offline rows split by level; rows written for any role; §15.3's till-approval row and Failed members; `till-approval-level-test` | §10.2, §9.6, §15.3, §15.1, §10.3, §21.1 |
| M2 · the dashboard lock compares plaintext codes in the browser | The mechanism stated, as shipped and as designed; plaintext and the local-first comparison removed either way, existing `kiwiPins` migrated once, the server asked first; owner decision 2 part (b), keep through a verifier (default) or remove; `pin.dashboard.offline_unknown` and the dashboard's offline rows; §22's entries; the Rules (with `/api/employee`), `pin.offline`, the lint rationale and revision 16's Sources line corrected; the engineering task cited as in progress; `dashboard-pin-migration-test` | §10.2, §9.6, §23, §22, §21.1, header |
| M3 · an assertive alert on every automatic retry | One retry rule: an automatic retry writes nothing unless its cause changes; a Try again, or a request it joins, is announced; `pin-announce-test` asserts the silence; §10.26 uses the same rule | §10.2, §10.26, §15.3, §21.1 |
| M4 · the glyph and paint checks read references | Path data hashed against the vendored files (and re-read from them by the kit self-test); every icon's computed transform chain, fill, visibility, opacity, scale, rotate and size, in both themes, with only §9.5's mirror allowed; each change's text and each arrow's `<use>` by computed colour; mutations 143 to 155; a 695-case sweep, all caught; the preview's claims rewritten to match | §18.0, preview |

**Polish:**

| # | Fix |
| --- | --- |
| P1 | `pin.offline_unknown`: "This code can't be checked offline on this till" (§9.6, §10.2) |
| P2 | `pin.offline`: "This code can only be checked online", true of every use it has (§9.6) |
| P3 | §15.3's opening rule corrected; an offline verdict fires under the 600 ms rule, with its trace in `haptics-trigger-test` (§15.3, §15.1) |
| P4 | One timeout, `KIWI_REQUEST_TIMEOUT_MS` = 8 s, and one retry timer, stated in §10.2 and used by §10.26 |
| P5 | The census rule observes requests on the network, and names stage 1's Plex overlap and Inter Tight's two subsets (§6.1, §6.5) |
| P6 | Owner decision 2 and §10.2: the till opens whenever the staff list cannot be loaded, with the four causes (§23, §10.2) |
| P7 | Rebuttal 2 reworded (Rebuttals) |

**Round 16 index (revision 16), kept as history.** UI, Feel and haptics and Performance scored 10 in round 16.

**Majors:**

| Finding | Fix | Section |
| --- | --- | --- |
| M1 · "codes are server-only" is false for the shipped till | The offline verifier stated with its lifecycle; one offline row per use; `pin.offline_unknown`; `pin.offline` and `pin.manager.offline` scoped; owner decision 2 restated as keep or remove, default keep; §22's conditional list; the lint rationale corrected; R10 and the `pinVenue` engineering item for the store lock | §10.2, §9.6, §23, §22, §10.26 |
| M2 · the preview's icon checks read labels | Every icon's label must agree with the symbol its `<use>` draws; glyph reads in checks 1 and 13; arrow paint against polarity in both themes; mutations 134 to 142; a 132-icon sweep, all caught | §18.0, preview |
| M3 · PIN pad refusals unannounced, and R8 contradicted the pad | The message row as a polite and an assertive region, written once per answer by a stated rule; R8 and the pad-step rule rewritten; `pin-announce-test` | §10.2, §10.26, §21.1 |

**Polish:**

| # | Fix |
| --- | --- |
| P1 | R6 and the focus rule: the title for the pair-back request, Try again only after a press (§10.26) |
| P2 | No Try again before the first failure; its slot reserved (§10.26) |
| P3 | The timer from each request's end; `online` ignored during a request; a joined request is the cashier's (§10.26) |
| P4 | The roster lines say "Keep it open without reloading it" (§9.6, §10.26 R9) |
| P5 | The census rule per weight and character, the Inter Tight subsets allowed by name; Latin Extended declared first (§6.1, §6.5, preview) |
| P6 | The exit into the till in §14.4 and §14.5 |
| P7 | §6.1 says the preview's file names differ |
| P8 | The SE status bar at 13 px (preview) |

**Round 15 index (revision 15), kept as history.**

**Majors:**

| Finding | Fix | Section |
| --- | --- | --- |
| M1 · the roster step's in-flight state was undefined, and `rosterPending` had two definitions | One definition (set at the pair-back, cleared only by a verified roster), used by the predicate, the lifecycle table and check 15; `state.checking` with no cause line while in flight; an 8 s timeout read as no connection; a non-JSON body read as a server error; mutations 129 to 133. No Cancel, with its reason (Rebuttals, 2) | §10.26, §10.2, §18.0, preview |
| M2 · `lock.roster.server_error` said Kiwi sends personal codes to the till | Both roster lines say the till could not load the staff list, in three languages; a grep of every row; a lint that fails revision 14's copy; "Staff list" in the glossary | §9.6, §9.1, §10.26 |
| M3 · the coverage test passed U+202F | The corpus is every emitted character; a `local()` face covers a character only where a per-platform capture of the real font shows it; loaded and swap checks; U+202F banned, with a lint | §6.3, §6.1, §9.6 |

**Polish:**

| # | Fix |
| --- | --- |
| P1 | R1 scoped once: while the lock shows, in either step, with each step's allowed request (§10.26) |
| P2 | R9 qualified for the roster step, before and after an autosave (§10.26) |
| P3 | The offline-copy branch removed, with `caisse-pairing.js:221` and `:376` (§10.26) |
| P4 | Try again focusable and `aria-busy`, repeat taps ignored, focus kept; the step's line is its polite region; R8 rewritten (§10.26) |
| P5 | The lock's body and the roster line in Body ink, line height 1.4 and 1.6 (§10.26) |
| P6 | `<bdi>` for every interpolation in the DOM, FSI and PDI in attributes; `strings-bidi-test` (§9.6) |
| P7 | U+00A0 before `? ! ; : »` in 24 FR rows; lint (§9.6) |
| P8 | الحساب is the bill only, حساب Kiwi the account; 10 AR rows changed; lint; glossary row (§9.1, §9.6, §6.6) |
| P9 | Check 1 reads both Home units; AR key figure with U+00A0; mutations 125 to 128 (§18.0, preview) |
| P10 | Android's shift accepted, why, and the measured remedy (§6.1) |
| P11 | The app shell's EN and AR stacks quoted in full and audited per family (§6.1) |
| P12 | `--k-dur-3` lists the lock's entrance (§14.1) |
| P13 | The exact `@font-face` block in §6.1; the preview declares it and its self-test compares it, with a negative control (§6.1, preview) |
| P14 | The counting rule stated, the counts generated: 453 rows, 443 Arabic strings, 3,608 measurements (§6.6) |

**Round 14 index (revision 14), kept as history.** Feel and Performance scored 10 in round 14.

**Blocker and major:**

| Finding | Fix | Section |
| --- | --- | --- |
| B1 · the kit stack set Arabic in Arial | The fallback face limited to Inter Tight's two file ranges, with Kiwi Arabic placed before it. Per-character fallback stated, and every stack audited (kit, legacy, app shell, preview). `font-coverage-test` resolves each character through its stack; `kit-in-host-test` measures "مقعدان" against Plex; `label-fit-test` logs an Arabic reference label. The preview draws in the shipped stack with the fallback face declared, and measures the word against Plex, with revision 13's stack as a negative control. Every Arabic width in §6.6 re-measured; none changes | §6.1, §6.3, §6.6, §20.2, preview |
| M1 · the paired-back, roster-unverified state had no name | The roster step, in the predicate and in the lifecycle table: its own title, one cause line per failure (no connection, server error), no pad, Try again, an automatic retry only for no connection, and its own focus rule. R1, R6 and R8 widened; check 15 cases and mutations 121 to 123 | §10.26, §9.6, §10.2, §18.0 |

**Polish:**

| # | Fix |
| --- | --- |
| P1 | The "unpaired till restores any blob" claim withdrawn, with the code that makes it false (§10.26) |
| P2 | The Next-chunk change limited to Arabic at 400 to 600 in §6.5 and in the stage 1 row; the census test's samples name their weights (§6.1, §6.5, §21.1) |
| P3 | One predicate, `lockStep`, written in §10.26 and used by every case of check 15; a service with no store left out by name; mutation 124 (§10.26, §18.0, preview) |
| P4 | Check 13 reads Orders' method icons from the log; check 10 reads each bill line's group from its position; mutations 118 to 120 (§18.0, preview) |
| P5 | Mutation 101 rewritten with the current rows; `__kiwiPreview.why(n)` reports each target check's reason (§18.0, preview) |
| P6 | A §10.2 row for a store with no staff codes (§10.2) |
| P7 | `lock.store.why_body_unpaired`; AR دفاتر for books (§9.6) |
| P8 | `chart.summary_same` in the chart's label (§10.22) |
| P9 | The store lock entrance in §14.4, and its reduced-motion row in §14.5 |
| P10 | The rebuttals paragraph rewritten (Rebuttals) |

**Round 13 index (revision 13), kept as history.** Visual, Accessibility, Motion and Performance scored 10 in round 13; the only change to §15 was one member added to Failed (P1). The round 12 rows about the gate, the parked service and "Pair a different store" are replaced by the scope cut below.

**Blocker and majors:**

| Finding | Fix | Section |
| --- | --- | --- |
| B1 · the lock fires on idle tills | Keyed on an open service (`shiftOpenedAt`, not closing); `shiftMerchant` names the store only while one is open; R2; `lockCases` with an idle re-pair and an idle unpair; mutations 111, 114, 117 | §10.26, §18.0 |
| M1 · an unguarded gate reference on pages without the gate | Requirements stated without code; R4 and its unit test with no lock code loaded | §10.26 |
| M2 · a parked service invisible on iPad | Parked state removed | §10.26, §9.6 |
| M3 · "Pair a different store" demanded a second code | Removed with the parked state | §10.26, §9.6 |
| M4 · the gate on the kitchen screen and the app shell | R3: the lock never affects another page; `tenant-gate-test` opens the kitchen screen on the same origin | §10.26 |
| M5 · undeclared Plex weights and the two-URL rule | Weights per page in the census; 200 and 300 to 400, 700 to 600, with the pages each changes; the Next-chunk stage 1 change limited to Arabic 400 to 600; two-URL rule scoped to overlapping ranges; the census test checks the mapping | §6.1 |
| M6 · a Plain trigger for a Tier B act | Removed with "Pair a different store" | §10.26 |

**Polish:**

| # | Fix |
| --- | --- |
| P1 | 409 `pair-other-store` in Failed's members and in §15.3's pairing row (§15.3) |
| P2 | A 409 row in §10.2's states; 422, 429 and network rows list the store lock (§10.2) |
| P3 | No same-browser fallback on the lock's pad; `pin.offline` offline; R5, `lock-pad-test`, mutation 116 (§10.26) |
| P4 | R6: never opens the service without a verified roster, except a store with no staff codes by choice; `lock-exit-test`, mutation 115 (§10.26) |
| P5 | `lockAttempts` from sources; mutations 112 and 113 rewritten (§18.0, preview) |
| P6 | Two reasons, consistently (§10.26) |
| P7 | AR الحساب in `lock.store.why_body` (§9.6) |
| P8, P10, P12 | Removed with the parked service |
| P9 | `ai.today_same`, `chart.summary_same` (§6.3, §9.6) |
| P11 | §18.0 sentence repaired; preview intro "light and dark" (§18.0, preview) |
| P13 | Gate citations moved to the engineering task; R1 runs on the web page and the app bundle (§10.26) |

**Round 12 index (revision 12), kept as history.** Motion, Feel and haptics, and Performance scored 10 in round 12. Round 11's M1 call table is replaced by the gate (M1 below), its M3 page count by the census (M5 below), and its `sale-unsynced-test` network assertion by `tenant-gate-test` (M2 below).

**Major:**

| Finding | Fix | Section |
| --- | --- | --- |
| M1 · the call table missed about ten store-keyed channels, several inbound, and the shipped success path | `KiwiTenantGate` in `assets/tenant-gate.js`, first script on every page that loads `pairing-commit.js`, wrapping the five exits `api-base.js` already wraps; deny by default for `/api/` and `/auth/` while locked, except `/api/pair/redeem` and `/api/pair/recover`; the check inside `postSale` and `postRefund`, so every vertical caller is covered; a category table (outbound, inbound pollers, push channels, local timers, pairing, error reports, static), each stopped, allowed or held; `submit()` stops after `confirmTillProof()` instead of `flush(true)` and `bootWithPin(B)`; `tenant-gate-order-test` discovers the pages | §10.26 item 3 |
| M2 · the network assertion could not pass (HttpOnly cookies) | `tenant-gate-test` through the DevTools Network domain: no `/api/` or `/auth/` path but the two pairing routes, and no `merchant=B` in a query or body but theirs; cookies named out of scope | §10.26, §21.1 |
| M3 · "the till comes back as it was" skipped the staff gate | The exit is A's staff pad with focus on its title; the staff gate is never skipped; the pane captures its cashier when it opens; mutation 112 | §10.26, §10.2, §9.6 |
| M4 · three places break the delta rule | Scope stated: a figure gets an arrow and a sign, a sentence an unsigned value and a direction word; the cash Difference is a balance, a named exception with no arrow; check 1 holds both forms; mutation 110 | §6.3, §18.0 |
| M5 · the Plex count of 48 was wrong, and stage 1's green claim failed | `tools/plex-census.mjs` walks `git ls-files` HTML and classifies each page (markup link, `article.css`, Next chunk, Kiwi declaration, none); its output at `31c94529` is 52; the Next-chunk pages link the self-hosted face after the chunk, which is immutable and has no source to rebuild; `font-face-census-test` runs the script and checks placement per class | §6.1, §6.5, §21.1 |

**Polish:**

| # | Fix |
| --- | --- |
| P1 | The lock's title is Heading, the pad's title step (§10.26, §10.2) |
| P2 | §18.3 points at §10.26's visibility rule (§18.3) |
| P3 | Stage 4: a code that is not A's is refused with `lock.store.wrong_store`, and the lock stays (§21.1) |
| P4 | Stage 3a: "the PIN pad in every use §10.2 lists" (§21.1) |
| P5 | `home-ar` drawn in light and dark; §18.0 says which frames are checked and that contrast is the tokens' (§18.0, preview) |
| P6 | The self-test intro names W (ten, revision 11) and X (four, revision 12) (preview) |
| P7 | `lock.store.memory` "Sales from {store} on this till are only in this screen's memory."; FR "verrouillée", "déverrouille" (§9.6) |
| P8 | `expectMerchant` in `/api/pair/redeem`, a 409 that leaves the code unused; `lock.store.wrong_store`; "Pair a different store" with a Tier B sheet naming the sales, bills and cash it sets aside; the parked state and row 9 `sync.parked`; mutations 111 and 113 (§10.26, §9.6, §23) |

**Round 11 index (revision 11), kept as history.** Motion, Feel and haptics, and Performance scored 10 in round 11. The round 10 and round 9 indexes below are kept as history too, and where a row in them describes a rule this revision replaced, the round 11 row says so: round 10's M3 and M5 (the other-store banner, `sync.pair_back`, the disabled Charge) are replaced by M1 and M2 below; round 10's P4 strings are gone with them; round 9's M2 fold of `sync.not_saved` into `sync.storage_error` is removed (M4 below).

**Major:**

| Finding | Fix | Section |
| --- | --- | --- |
| M1 · the other-store state pauses only the sale sends; floor, kitchen, refunds, cash and print keep running against the new store | A full-screen store lock on the pairing pad, with the pad and an explanation as its only actions; one predicate, `tenantMismatch()`, asked first by every store-keyed call, listed with its shipped site; `sale-unsynced-test` allows no request but the pairing call while locked; an open pane finishes first; mutation 102 | §10.26 item 3, §10.2, §9.6 |
| M2 · the re-pair purges the stored service, and the spec never says so | The purge cited (`pairing-commit.js:73-86`, `tenant-purge.js:34`); the state memory-only in its lifecycle table and in the entry-fields table; "Keep this till open and don't reload it" in `lock.store.body` in EN, FR and AR, plus `lock.store.memory`; the held copy `kiwiHeldService:<store>` as a stage-4 engineering dependency; owner decision 13 | §10.26, §9.6, §23 |
| M3 · `legacy-faces.css` sits outside the stamp tool, and the census rule fails stage 1 | `assets/fonts/*.css` in the CSS-site pass and a served-folder table that fails an unlisted folder; linked on all 48 pages that name the family, measured through the stylesheets each loads; the 12 pages with no Google Plex (including `booking.html` and `tickets.html`) get Plex for their Arabic at stage 1, stated as a visible change with an AR capture review; the census rule follows loaded stylesheets | §6.1, §6.5, §21.1, §21.3 |
| M4 · check 15 orders and folds rows against §10.26 | The model sorts by row number and lists every row; `storage-full` is `[storage_error, not_saved, not_synced]`; the other-store cases draw the lock with `[storage_error]` under it when storage is full; mutations 100 and 101 draw revision 10's order; the round 9 fold rule removed from this index | §10.26, §18.0, §24 |
| M5 · three delta-sign rules | Arrow plus `signed`, everywhere: §6.3's change rule and its table row, §10.21, §10.33, the §18.1 hero, every Home frame, and check 1 through `KiwiFormat.signed`; mutations 104 and 105 | §6.3, §10.21, §10.33, §18.0, §18.1 |
| M6 · rows that ask for action are never announced | `sync.blocked` and `sync.not_synced` once each, politely, when they first apply; count changes not announced; a row that clears and returns is announced again; nothing under the lock; `banner-announce-test` cases | §10.26, §10.12, §14.6, §16 |

**Polish:**

| # | Fix |
| --- | --- |
| P1 | `recordSale`'s four `persistShift` calls, `:14733` (the queued branch) included (§10.26) |
| P2 | The restore citation corrected (`:23055` checks only on a paired till); an unpaired till that restores a blob shows the lock; `older-store-entry` replaced by the held-entry invariant, `heldShownBy`, mutation 103 (§10.26, §18.0) |
| P3 | The guard requires a non-empty merchant; `paidCases` carry `merchant`, `paired` and `liveMerchant`, and check 15 computes the guard from them; mutation 109 (§10.26, §18.0) |
| P4 | `lock.store.body_unpaired`; the `unpaired` fixture case; no live region written under the lock; mutation 106 (§10.26, §9.6) |
| P5 | Banners carry one Plain action at most; the secondary `sync.pair_back` and the disabled Charge are gone with the banner (§10.12, §10.26) |
| P6 | Badge colour per row (`sync.not_synced` warning-solid, 9.61), and one rail badge: the first of rows 3 and 4 that applies, in its colour (§10.13, §10.26) |
| P7 | `access.suspended`: "This store's Kiwi access is paused." (§9.6) |
| P8 | The gate is in `tools/app-archive.sh`, after `check.js`, and requires a pass on an iOS 15.5 simulator runtime and the newest installed; the `build-app-www.mjs` claim removed (§6.3) |
| P9 | `current-attendance-code` returns the server's `now`; the timer runs on the till's monotonic clock from it (§10.34) |
| P10 | A string with an interpolated name is never a one-line control; `label-fit-test` fails one and wraps the lock's title and body with a 40-character name at 744 (§6.6) |
| P11 | Check 17 compares each zone's tables and the till's dish order; mutations 107 and 108 (§18.0) |
| P12 | In production a banned code point is repaired and reported once per call, never blanked (§6.3) |

**Round 10 index (revision 10), kept as history; see the paragraph above for the rows revision 11 replaced.** Motion and Performance scored 10 in round 10 and are not reopened. The round 9 index below stays in force except where a round 10 row replaces it: M1 and P6 of round 9 (now one lifecycle table, §10.26 item 3, which removes `savedLocally` and `saleSyncWaiting`), M4's font paragraph (corrected by M2 below) and P9's attendance times (P8 below).

**Major:**

| Finding | Fix | Section |
| --- | --- | --- |
| M1 · frames draw U+0020 where §6.3 puts U+00A0, and the checks fold it away | Frames carry the formatter's code points; `txt()` and `fold()` collapse only markup whitespace; failure messages name a space-only difference; mutations 80 to 82 | §18.0, preview |
| M2 · the legacy Plex declaration is cited in a file that has none | `tokens.css` has no `@font-face`; on the web Plex comes only from Google links on 18 pages; stage 1 adds `assets/fonts/legacy-faces.css`, linked before each Google link, so no later stage can drop the family undeclared; `font-face-census-test` fails on a rendered family with no declaration | §6.1, §6.5, §21.1 |
| M3 · a re-paired till books one store's sales into another | `merchant` on every journal entry at sale time, kept on reload; `postSale` and the replay only for the paired store and never in the other-store state; the heartbeat and outbox flush pause there; `sale-unsynced-test` re-pairs A to B and asserts nothing reaches B; check 15's replay cases, mutations 88 and 89 | §10.26, §18.0, §21.1 |
| M4 · banners are never announced | A live region present at load; danger banners `role="alert"`, others `role="status"`; written once, never repeated by a timer; `sync.saved_again` on recovery; `banner-announce-test` | §10.12, §14.6, §16 |
| M5 · the other-store state has no way out | The banner names both stores and carries `sync.pair_back`; Charge is disabled while it lasts; the exit is pairing back, the only safe one (closing for the old store while paired with another would post its Z to the wrong store); it outranks the storage banner and the storage row stays listed; mutations 86 and 87 | §10.26, §9.6 |
| M6 · check 15 contradicts the receipt-return rule | The receipt-return path is its own branch with no outbox input, never `sync.saved_here`; mutations 83 and 84 | §10.26, §18.0 |
| M7 · the named WebKit runner does not exist | puppeteer-core 24.43.1 (already in the repository) for Chromium and shadow-root queries; the iOS Simulator through `xcrun simctl` and a Node built-in server for WebKit, no package and no lockfile; it runs on the Mac that builds the app and gates the release build | §6.3, §2, §20.4, §21.1 |

**Polish:**

| # | Fix |
| --- | --- |
| P1 | Check 17 compares the venue, zones, categories, the AI weekday and the avatar initials; check 14 both line ends; §18.0 lists what is still not compared (curve shape between the ends, layout, keyed strings); mutations 90 to 97 and 99 |
| P2 | Relative days: `numeric: 'auto'` for 0 and 1, `'always'` from 2, marks dropped, U+2019 written U+0027; vectors; mutation 98 (§6.3) |
| P3 | `plusSign` and `signDisplay` rows; values rounded before formatting, so zero is never signed; vectors (§6.3) |
| P4 | مربوط and "commerce" in `sync.not_saved_store` and `sync.waiting_store`; both in the glossary (§9.1, §9.6) |
| P5 | Badge only on `sync.blocked` and `sync.not_synced`; colour per row; visible while any of rows 1 to 8 applies (§10.26) |
| P6 | One table of entry fields and till values with set, clear and persist; two fields removed; the stale `'sale-sync-unavailable'` dropped on restore; a refusal kept while Live Link is off (§10.26) |
| P7 | Done and "Other percentage" fire nothing; the "nothing else moves" rule applies to the preset rows (§10.26) |
| P8 | `attendance.changes_at` shows `expiresTs − 60 s`, when the code is replaced (the server renews at 60 s left, not "at least 60"); on a failed refresh one time only, the expiry (§10.34) |
| P9 | The preview declares Plex as `Kiwi Arabic` (preview) |

**Round 9 index (revision 9), still in force except where a row above replaces it.** Motion, Feel and haptics, and Performance scored 10 in round 9; no fix below touches §14, §15 or §19. The round 8 index further down stays in force except where a round 9 row replaces it: F1's paid line (now widened by M1, M2 and P6), F4's gridlines (P4) and F8's banner geometry (P5).

**Major:**

| Finding | Fix | Section |
| --- | --- | --- |
| M1 · Live Link off reads as "not sent" | `postSale`'s `undefined` split by `KiwiLive.isOn()` and `KiwiLive.merchant()` into off (no rail indicator, neutral More row `sync.off`, no `saleSyncError`), no tenant yet (`sync.waiting_store`, ink-2, healed by the heartbeat) and not applicable; only `{ok:false}` or a throw is refused; `'sale-sync-unavailable'` is no longer written; check 15 runs nine cases, mutations 73 to 75 | §10.26, §9.6, §18.0 |
| M2 · a failed autosave has no persistent state | One till-wide autosave state from every `persistShift` (`true`, `false`, `'other-store'`), including the 5 s autosave; `sync.not_saved` or `sync.not_saved_store` as a danger banner and an indicator row until one lands (revision 11: the fold into `sync.storage_error` that this row once described is removed, every applicable row is listed, and `sync.not_saved_store` is replaced by the store lock); the outbox-queued case and the merchant-mismatch return are fixture cases and `sale-unsynced-test` cases; mutations 76 and 77 | §10.26, §9.6, §18.0, §21.1 |
| M3 · `KiwiFormat` cannot produce its own table | Tags `en-GB`, `fr-FR`, `ar-MA-u-nu-latn`; every string assembled from `formatToParts` by part type (group, decimal, minus, literals, percent, compact, date parts, h23 time), then a banned-character assertion; Chromium 152's raw output recorded; the CLDR sentence replaced; `tools/format-vectors.json`, asserted first by check 1 and by `format-vectors-test` in WebKit; mutations 71 and 72 | §6.3, §18.0, §21.1 |
| M4 · the kit font stack is specified two ways | `--k-font` set by `tokens-2027.css` to the §6.1 stack, independent of `--sans`; `kit-in-host-test` asserts it on EN and AR hosts and measures the AR guest chips; `Kiwi Arabic` and `IBM Plex Sans Arabic` share one URL per weight until stage 7 | §6.1, §6.5, §20.2 |
| M5 · drawn chart, badge and chip not checked | Check 14 derives today's and yesterday's value at the clock, the now-dot, the step gridlines with their labels and the axis labels through the plot scale; a `notifications` source and check 16 for the bell's badge and the Kiwi AI source chip; the critic's seven mutations are rows 59 to 67, all red, plus 68 to 70; §18.0 says exactly what is compared | §18.0, §18.1, preview |

**Polish:**

| # | Fix |
| --- | --- |
| P1 | R4's GET 503 shows `ob.reset.check_failed` "Couldn't check this link. Try again."; `ob.reset.failed`'s note says it is never used on R4 (§18.8, §9.6) |
| P2 | `floor.table_free_a11y` is "{table}, {status}, {seats}" with `floor.status.free`, so AR says متاحة (§9.6, §18.4) |
| P3 | §18.7's "which is also the till rail's Kitchen badge" deleted (§18.7) |
| P4 | §10.22's anatomy: the band-edge gridline plus round steps (10K in the fixture), with the step rule (§10.22) |
| P5 | Banners measured at the real 283 message width of the 343 onboarding page, line counts at factors 1 and 1.35 (§18.8) |
| P6 | The receipt-return path reads the till's autosave state, never the entry's stale `savedLocally`; fixture case and mutations 78 and 79 (§10.26) |
| P7 | "Other percentage" is typed in the pane's keypad column (tip mode on the Cash keypad, a pushed keypad otherwise); the Received entry is kept and restored (§10.26) |
| P8 | Expected's Heading row is hidden until the crossfade; the opening float's key figure is the counted float in Display (§18.9) |
| P9 | A failed refresh poll keeps the code until `expiresTs` with `attendance.refresh_failed`; the no-code state only when no code is showing (§10.34, §9.6) |

**Round 8 index (revision 8), still in force except where a row above replaces it.** The round 7 index (revision 7) is superseded. Its rows stay in force in the sections they named, except where a round 8 row below replaces them: the paid-moment line (round 7 B1 stays; its `sync.saved_here` claim is now F1), the reset routing (round 7 M2, now F2 against the shipped server), and the fixture's checks (round 7 M5, widened by F3).

**Major:**

| Finding | Fix | Section |
| --- | --- | --- |
| F1 · storage full still says "saved on this till" | `persistShift` returns whether `setItem` landed; `recordSale` keeps it as `entry.savedLocally`; `sync.saved_here` only when it did, `sync.screen_only` "Recorded on this screen only. Keep the till open." when it did not; `sync.storage_error` reworded to match; check 15 with four cases, mutations 55 and 56; `sale-unsynced-test` covers it | §10.26, §9.6, §6.6, §18.0, §21.1, preview |
| F2 · R5 says the link is dead after `e5639388` | Cited as shipped (`e5639388`, `a3de3011`): 500 with `retry: true` keeps the form and the link with `ob.reset.failed` "Your password wasn't changed. Try again."; a plain 500 goes to R5 with `ob.reset.used_body` and the one-tap new link; 400 `bad-json` and 503 `not-configured` keep the form; R5's copy is true for a database fault during consumption (`:123`); §23.12 marked shipped; `reset-states-test` | §18.8, §9.6, §23.12, §21.1 |
| F3 · checks overclaim coverage | Check 1 derives every date and time from `date` and `now` (date button, baseline, legend, AI stamp, Orders' date, status bars); new checks 12 (rail cashier, Orders hour headers), 13 (floor status icons, VIP stars, tile badges and option marks), 14 (chart band) and 15 (paid line); open-order records for tickets 43, 46, 47, 48 and 50, so check 4 compares every ticket with a source; seventeen new mutations, 42 to 49 being the critic's eight, all red | §18.0, preview |

**Polish:**

| # | Fix |
| --- | --- |
| F4 | The top gridline sits on the band edge and is labelled with the maximum ("30.1K", AR "30,1 ألف") in all three Home frames; check 14, mutations 53 and 54 (§10.22, §18.1, §18.11) |
| F5 | A compact-short form from 514 to 577 (56-tall keys) and, below 514, the page scrolls as a whole, never a column; heights stated (§18.3, §13.3, §10.26) |
| F6 | Stage 1 names the `@font-face` rules and family names it repoints, not the retired `--kiwi-native-latin` (§21.1) |
| F7 | §19 basis re-measured at `31c94529`: 34,611 and 46,794 B gzip (§19) |
| F8 | §18.8 counts Callout banners: 5 steps, with each banner's measured lines (§18.8) |
| F9 | AR `badge.new` shows the "other" form, {n} جديد (§9.6) |
| F10 | `floor.table_free_a11y` "{table}, Free, {seats}" in three languages (§18.4, §9.6) |
| F11 | The attendance sheet's error state covers 503 `not-configured` (`live.js:147`) and 400 `bad-json` (`:149`) (§10.34) |
| F12 | Difference is the cash count's key figure in Display (44), above the Title keypad digits; Expected holds the slot until the first entry; measured widths (§18.9) |
| F13 | The payment method rows fire Choose, once per change (§10.26, §15.1) |

---

## Rebuttals

1. **Round 6 M11, rounding "to the last guest".** The discount is shared pro rata, as asked, but the leftover cents go **by largest remainder, ties to the earlier share**, not to the last share. That is not a new rule: it is the till's shipped allocator, `shareWeighted` (`kiwi-caisse.html:13490-13506`: "Largest remainders receive the leftover centimes"), which the split already uses for by-item tips (`:13611`). Inventing a second rounding rule for discounts would let the same split round two amounts two ways. Largest remainder also never moves a share by more than one cent from its exact pro rata value, which "all to the last" does not guarantee when the remainder is several cents.

This rebuttal was accepted in rounds 7 to 25 and is kept for the record. The census of 52 pages (§6.1) was accepted in rounds 13 to 15.

2. **Round 15 M1, "cancel available" in the roster step's checking state.** Revision 15 adds the named loading state, the timeout and the classification the finding asks for, but no Cancel. A Cancel needs somewhere to go, and this step has nowhere: the lock's only exit is a verified roster (R6), the pad step no longer applies because the till is already paired with the service's store, and stopping the request would leave the same screen without its busy state. The wait is bounded instead: the 8 s timeout ends every check with a stated cause. From the first failure on, Try again is shown, enabled, focusable and live, busy while its request runs (revision 15, P4); before that failure nothing has failed and there is nothing to offer again, so the button's slot is reserved and empty (revision 16, P2). The cashier is never stuck behind a control they cannot leave. A Cancel that changes nothing would be a control that lies about what it does.

This rebuttal was accepted in rounds 16 to 25 (moot since round 22), and reworded in revision 17 (P7) because revision 16 had made its last clause untrue; it is kept for the record. Revision 21 removes the roster step itself, because the store lock now follows what `762bb255` ships (§10.26), so the rebuttal no longer describes the body.

3. **Round 18, finding 7, "the pending clock-in time is kept" and "offers to get a new one".** The expiry is now its own cause, announced once, as the finding asks. Two parts are not done, on purpose:
   - **No clock-in time is kept.** The server stamps a clock-in when it accepts it (`functions/api/employee.js:509`, `inTs: now`), after checking that the attendance code is the till's current one and has not expired (`:495`). That code exists to prove that the person was at the counter at that moment (`:482-483`: it "proves the employee is physically present at this store"). A time kept on the phone from before the code expired would let a phone claim presence the code no longer proves. The copy therefore says when the time is recorded, "when a code is accepted", instead of promising an earlier one.
   - **The team app cannot fetch a new code.** Codes are created only by the store's till or its owner's session (`functions/api/team/live.js:151`, `entitledMerchant(…, {allowTill: true})`, and the generation at `:159-175`), never by the team app's employee session, again because the code proves presence at the counter. So the copy sends the person to the till's new code, which the till already shows: every open sheet asks for the current code every 10 s (§10.34).

This rebuttal was accepted in rounds 19 to 25 and is kept for the record.

4. **Round 19, finding 4, in part: "check its pairing state (for example `/api/config` with the cookie)" after a timed-out redeem.** Revision 19 adopted the no-resend rule and `pair.maybe_used` in full, and the check only on the store lock. Revision 20 drops the check there too (round 20, M1: R1 forbids it in the pad step, and the second point below means it could almost never succeed). Why it could not be general:
   - a till without a session gets the roster from `/api/config` only for the store it names with `?merchant=` (`functions/api/config.js:184-190`), and `GET /api/pair/state` refuses a request without `merchant` (`functions/api/pair/state.js:27-28`); a till pairing for the first time learns its store only from the redeem's answer, which is the answer that was lost;
   - and a response lost in transit loses its cookies with it, because the till's cookies are set on that same response (`functions/api/pair/redeem.js:177-190`), so no client check can see a redeem whose answer never arrived.

   So the pad says `pair.no_answer` without a check, and the only complete fix is the server-side one the critique also names, a redeem by the same `terminalId` made idempotent for a short window (`redeem.js:91` already reads it), which §10.2 lists as an engineering option.

Rebuttal 4 was accepted in rounds 20 to 25 and is kept for the record.

**Revision 25 makes no new rebuttal.** Every round 25 item is fixed as indexed in §24, and what it leaves open is listed under §23. **Revision 24 made none.** Every round 24 item was fixed as indexed in §24; P9 followed `main`, which removed both tabs in `cda95c04`. **Revision 23 made none, nor did revision 22.** Every round 23 item was fixed as indexed in §24, and the owner's decision on the floor is applied. One reading of the critique is corrected, not rebutted: its "gift and team" icons on Customers are the shipped loyalty program and retention buttons (`assets/clients-directory.js@319ac100:368-369`), and both now live in the overflow (§18.5). Revision 21 made none, revision 20 none, revision 19 rebuttal 4, revision 18 rebuttal 3, and revision 17 none.

**Earlier rounds, for the record:**
- **Accepted rebuttals.** The round 5 rebuttal (self-serve password reset) was accepted in round 6. Revisions 8 to 13 made no new rebuttal.
- **Withdrawn counts.** Revision 11's hand count of Plex pages, which round 12 rejected on its total, was withdrawn in favour of the census script.
- **Corrections of fact from revision 11.** Round 11's M3 list of 13 pages included `kiwi-admin.html`, which at `31c94529` names the family neither in its markup nor in a stylesheet it links. The same list missed the 18 pages that get Google Plex through `article.css`'s `@import`.
- **Choices stated in revision 10,** where a critique offered a choice:
  - M5's exit is pairing back, not closing for the other store; §10.26 explains why the close would leak;
  - P7 drops the Done haptic rather than adding a §15.1 member;
  - M7's runner is the iOS Simulator, not safaridriver or Playwright (§6.3).
- **A citation note from revision 10.** F11 cites `reset.js:79` for the 503, but the attendance sheet's route is `functions/api/team/live.js`, whose 503 `not-configured` and 400 `bad-json` are at `:147` and `:149`. Those are the lines §10.34 maps, and §18.8 already mapped the reset route's own 503 at `:79`.
