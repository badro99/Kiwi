# Kiwi Pro · iPhone pass 7

Date: 2026-09-30. Base: `23c7d37d`. Isolated worktree: `codex/iphone-pass7`.

## Safety and scope

Only local demo data. Owner entry used **Enter the demo**, never a PIN. No merchant/staff PIN, till code or pairing code was entered. No Amira or Santos data, account deletion, payment execution, TestFlight upload or App Store submission. Newly filed tickets remain open.

Two actual simulators, controlled with Xcode UI tests:
- iPhone 17 Pro, `D53BB4E4-F195-41EF-8DE2-9F74BAEADC62`, 402 × 874 pt.
- iPhone SE-size test device, `13A85612-BDD7-4BF0-98F2-736D76D44C57`, 375 × 667 pt.

No Pro Max. FR, EN and AR × light/dark. A temporary local-only bridge read rendered DOM measurements and selected demo locale/theme fixtures; **taps were XCUI events**, not synthetic DOM clicks. The bridge was only in the generated simulator bundle, never source or a commit. Occlusion guards refused covered controls and all keypad targets. A first SE attempt stopped at the lock and was discarded, not counted as demo coverage.

## Change and evidence table

Proof paths below are relative to this document. The checked-in contact sheets, selected screenshots and measurement JSON are the durable review pack. The temporary raw capture directory was cleared during the pause; original `/tmp/kiwi-pass7-proof/` paths inside JSON are capture provenance, not currently available image links. Do not treat a JSON measurement as a retained screenshot.

| Ticket / item | Result | Commit(s) | Simulator evidence |
|---|---|---|---|
| A · overlapping splash and mismatched stages | One original 88 pt mark, safe-area top + 20 pt, `#0A1612` ground through storyboard, native shell and lock. Removed automatic duplicate storyboard scene. | `e6639f03`, `f7cfb9a3` | `pass7-proof/launch-before-after.jpg`, `pass7-proof/pro-signed-light-launch.jpg` |
| A · blank first web frame / late layout | Hold splash and native workspace messages until lock, bundled fonts and two animation frames are ready. Removed the delayed reveal. | `e6639f03` | `pass7-proof/launch-layout.json`, `pass7-proof/settled-frame-diff.json` |
| A · lock status text | Fixed dark lock ground keeps white system status text in light appearance. | `ee2d804f` | `pass7-proof/pro-signed-light-launch.jpg` |
| A · persistent language | One synchronous native locale bootstrap; migrate and synchronize the dashboard, till, Team and Kitchen compatibility keys. | `51d53c21` | `pass7-proof/roles-se.json`, `pass7-proof/roles-pro.json`; executable legacy-key migration tests |
| A · other roles / setup | Owner/Team/Kitchen/pairing gate marks aligned. The Till demo resumes its existing pre-register clock-in screen. Role chooser opened Kitchen, Team, Till and Dashboard in each language/theme, without entering codes. Merchant sign-in header inspected with empty fields in all six combinations on both sizes. | `e6639f03`, `f7cfb9a3` | `pass7-proof/roles-se.json`, `pass7-proof/roles-pro.json`, `pass7-proof/se-role-gates.jpg`, `pass7-proof/first-setup-matrix.jpg` |
| B1 · regulars | Group current and total through KiwiNumber; isolate signed delta; parse EN comma grouping without changing magnitude. | `8d32d34b`, `d6cf0dac` | `pass7-proof/known-pro.json`, `pass7-proof/known-se.json`, `pass7-proof/se-goals-matrix.jpg` |
| B2 · goal | Isolated percent/amount runs; content-height card instead of stretched empty band. | `9f0b7147` | same matrix; `pass7-proof/pro-ar-dark-goal-regulars.png`, `pass7-proof/se-ar-dark-goal-regulars.png` |
| B3 · card/cash | Keep `68 / 32` and percent unit in one LTR-isolated run under RTL. | `4368917a` | `pass7-proof/pro-ar-dark-ratio.png`, `pass7-proof/se-ar-dark-ratio.png`; known-item JSON |
| B4 / #0125 · empty menu | Actual New item → New section flow, cancelled without saving. Demo catalog already had zero sections; no merchant or fixture overwrite needed. | `d5902f17` | `pass7-proof/125-empty-menu-new-section-en-dark.png`, `pass7-proof/pro-en-light-new-section.png`, `pass7-proof/se-en-light-new-section.png`; six-combination measurements in known-item JSON |
| B5 · display-format sweep | Shared precision-preserving formatter across account, team, clients, menu, stock summaries, reports, operations and vertical display helpers. Receipts/fiscal arithmetic, export data and edit-input serialization unchanged. | `aa335ce1`, `bca982c0`, `d1bf481a`, `58074715` | known-item matrices and `pass7-proof/sheets-{pro,se}.json`; individual report/cash-close captures were temporary, not retained |
| #0128 · changing language aborts chart render | Filter invalid/out-of-range tick indices before formatting. | `ab5dfbb9` | successful six-combination audit in `pass7-proof/audit-{pro,se}.json`; original error screenshot was temporary, not retained |
| #0129 · Customers / Reservations leave menu open | Window-capture dismissal runs before document-level handlers intercept the destination click. | `888bca25`, `7701da29` | `pass7-proof/audit-se.json`, `pass7-proof/pro-ar-dark-clients-sidebar-final.png`, `pass7-proof/pro-en-light-reservations-sidebar-final.png`; final measurements in `pass7-proof/sheets-pro.json` |
| #0130 · daily report numbers / RTL delta | Shared money formatter; signed percentage in LTR bdi. CSV remains numeric. | `d1bf481a` | `pass7-proof/audit-{pro,se}.json`; original individual report images were temporary, not retained |
| #0131 · AI header visual target | Visible button increased from 36 to 44 pt. **Classification corrected to Improvement:** the prior CSS already extended its hit area with a pseudo-element; the 36 pt DOM box alone did not prove a sub-44 pt effective hit target. | `98d3cfaf` | known-item JSON measures new 44 pt box; Xcode hierarchy also reports 44 pt |
| #0132 · cash-close display grouping | Shared display formatter and isolated signed totals. Stored counts, Z totals and fiscal/export values unchanged. | `58074715` | `pass7-proof/sheets-{pro,se}.json` asserts `8,240` EN / `8 240` FR/AR; original individual cash-close images were temporary, not retained |
| #0133 · French accessibility names | Menu, home, sidebar and notification names follow the locale. Stable notification action/badge selectors do not depend on translated labels. | `819cfcbc` | final header DOM / native hierarchy; notification-sheet retest |
| #0134 · translucent AI drawer | Native owner-specific rule now outranks the Relevé skin; opaque light/dark sheet background. | `98f4298c` | `pass7-proof/ai-opacity-final.json`, selected before/after screenshots |
| #0135 · small-height entry flow | Ticket only: demo/change-role actions need scrolling on SE. Compact authentication-entry layout is left for owner decision; no validation or authentication flow changed. | none | `pass7-proof/se-role-gates.jpg`, `pass7-proof/se-en-dark-first-setup-final.png` |
| #0136 · lock contrast in light mode | Explicit readable secondary ink for code instructions, Switch account and Change role on the fixed dark ground. Authentication handlers unchanged. | `56a1de7f` | `pass7-proof/lock-light-before.png`, `pass7-proof/lock-light-after.png`; launch matrices record final computed colors in all six combinations |
| C · broad audit | Main menu + native tabs + common sheets covered below. **Not an exhaustive certification of every data-dependent drawer.** | this report | audit, sheets and roles matrices |

## Launch proof: an important signing distinction

The first baseline and early debug bursts were **unsigned**. SpringBoard reported `Resource validation error: Security error -67056` for the launch storyboard nib. Those early black frames include a simulator-signing artifact; they are **not** evidence that a CSS change alone removed an iOS launch bug.

After copying the generated public bundle, ad-hoc signing the simulator `.app` and verifying that signature, both Pro and SE start with the green ground and a single mark. The first frame can include the normal SpringBoard app-opening zoom. No blank or overlapping-logo stage was seen in the signed final Pro bursts. The before/after contact explicitly labels the unsigned baseline.

In Arabic Pro light/dark bursts, the mark's colored-pixel bounds are identical from frame 1 through frame 23: `[519,268,687,479]` physical pixels. The settled lock/keypad content crop has **zero pixel difference from 1.75 s to 5.75 s** in both appearances. This is measured stability, not an assumption from source. SE first-install frames transition to onboarding, so their later bounds are not claimed to represent the owner lock.

Reproduce locally (generated bundle only): build app web content, Capacitor sync, restore `app/ios/App/CapApp-SPM/Package.swift`, then Xcode Debug simulator build. When using `CODE_SIGNING_ALLOWED=NO`, run `codesign --force --deep --sign - <App.app>` **after** all bundle copies, followed by `codesign --verify --deep --strict <App.app>`, before install/launch. Copy the synchronized iOS `public/` directory, not `app/www`, which omits Cordova support files. Never ship the temporary QA bridge.

## Coverage and remaining boundaries

- Main menu audit: 13 destinations × six combinations × two devices = **156 navigations**. Home, Orders, Daily report, Customers, Terminals, Compliance, Team, Planning, Reservations, Floor/table assignment, Menu, Stock, Finance. No root page wider than 402/375 pt in those captured views.
- The original Pro Customers/Reservations images still show the discovered sidebar bug. Do not treat them as clean page proof. The final sidebar retests supersede those specific images; SE's complete matrix already has the corrected capture handler.
- Final launch matrix: 12 cold launches, each with 24 screenshots at 250 ms targets, plus 12 empty-field first-setup captures. Both phones retain all four saved-locale keys on relaunch. Final secondary lock copy computes to `rgb(172,184,177)` in every combination. See `pass7-proof/{pro,se}-launch-six-combinations.jpg` and `pass7-proof/launch-matrix-{pro,se}.json`.
- Native bottom tabs: Home, Orders, Report, Customers. Common overlays: notifications, AI, custom date picker, table assignment and empty-menu New section. The sheet/native-tab matrix records 48 SE and 60 Pro captures (Pro includes 12 final sidebar retests). A further six SE AI/notifications retests verify the opaque panel and translated navigation labels. Forms were opened and cancelled, not submitted.
- Small DOM boxes are not automatically failed touch targets: existing pseudo-elements expand several pills and buttons. The report does not count invisible off-canvas navigation elements as visible touch-target failures.
- All four role entry paths are gate/launch checks. Team attendance, Kitchen pairing, signed-in merchant onboarding, live payment/refund flows, printers, account deletion, camera/microphone permissions, external customer delivery and merchant-specific data remain **unverified**, deliberately outside the demo-only/no-code boundary.
- The merchant sign-in flow was viewed with empty fields; it was not submitted. On the 375 pt phone some gate/setup actions require scrolling; a full compact-auth-layout redesign was not made.
- This pass does **not** claim every possible nested sheet, every row in every demo vertical, every accessibility font size, every keyboard state or every real-device animation is audited. A physical iPhone and production merchant validation remain separate work.
- B5 exclusions include receipt/fiscal formatters, timestamps/dates, number-input normalization, public marketing calculator copy, shared helpers that already use KiwiNumber with a fail-soft fallback, and technical file-size precision. No subscription/pricing or product logic was changed.

## Checks, delivery and evidence hygiene

`tools/native-pass7-test.mjs` is wired immediately after pass 5 in the full gate. It contains 46 source/executable checks, including real formatter output and conflicting saved-locale migration.

Launch timing changed harness expectations legitimately: browser mocks now supply animation frames and await paint; the reduced-motion test checks the static mark rather than a deleted spinner. The shared-day browser suite now uses locator mouse clicks to reacquire a control if a live render replaces it, retaining all 14 assertions. No suite/assertion was skipped. Standalone hotel-direct tests passed 176 assertions on both this branch and an untouched `23c7d37d` baseline; this was not called a proven pre-existing deterministic failure.

Final frozen-runtime gate: **`node tools/check.js` passed, exit 0, one existing `background:var(--ink)` debt warning, no skipped suites**, on code commit `56a1de7f`. The new pass 7 suite is green. The complete fresh log is retained at `/Users/zaka/.codex/artifacts/kiwi-pass7-final/check.log`; its checksum and result are checked in as `pass7-proof/gate-result.json`. Earlier temporary logs were cleared during the pause, so this result is from a fresh run, not inferred from prior progress. Earlier detached-node and timeout failures were fixed and rerun, not waived.

Delivery destinations are `https://github.com/zaka33333-hash/Kiwi.git` and `https://github.com/badro99/Kiwi.git`, using normal `HEAD:main` pushes, never force. The final handoff records the verified remote commit after this documentation commit; the matching delivery receipt is saved at `/Users/zaka/.codex/artifacts/kiwi-pass7-final/delivery.json`. No TestFlight upload or App Store submission is part of this delivery.

No ticket was marked fixed/done. The requested ticket connector was unavailable, so findings #0128–#0136 were filed through the signed-in ticket-board UI instead. #0131 remains open as an Improvement, not a claimed missing hit area.

Final simulator hygiene (verified before the pause): both installed bundles were restored to pristine synchronized assets and their signatures verified. Matching runtime hashes are in `pass7-proof/pristine-install.json`; `pass7-proof/pristine-pro-lock.png` is captured after removing the QA bridge. Xcode drivers and the local QA server are stopped. At that point the temporary SE simulator was shut down to release resources and Pro remained available; this is not a new physical-device or post-pause runtime check.
